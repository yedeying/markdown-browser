import type { Hono } from 'hono'
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'fs'
import { extname, join, sep } from 'path'
import type { ExternalPluginManifest } from '../types.js'

const PLUGIN_MIME: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

const SAFE_DIR_RE = /^[a-zA-Z0-9._-]+$/

function isSafeRelAsset(rel: string): boolean {
  if (!rel || rel.startsWith('/') || rel.includes('\\')) return false
  return rel.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..')
}

/** 扫描外部插件目录，收集所有合法的 manifest.json 声明。目录不存在时安全返回空数组。 */
export function listExternalPlugins(pluginsDir?: string): ExternalPluginManifest[] {
  if (!pluginsDir || !existsSync(pluginsDir)) return []
  let entries: string[]
  try {
    entries = readdirSync(pluginsDir).sort()
  } catch {
    return []
  }

  const out: ExternalPluginManifest[] = []
  for (const dir of entries) {
    if (!SAFE_DIR_RE.test(dir) || dir.startsWith('.')) continue
    const pluginRoot = join(pluginsDir, dir)
    try {
      if (!statSync(pluginRoot).isDirectory()) continue
    } catch {
      continue
    }
    const manifestPath = join(pluginRoot, 'manifest.json')
    if (!existsSync(manifestPath)) continue

    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8')) as Record<string, unknown>
      const id = typeof raw.id === 'string' ? raw.id.trim() : ''
      const name = typeof raw.name === 'string' ? raw.name.trim() : id
      const version = typeof raw.version === 'string' ? raw.version.trim() : undefined
      const entry = typeof raw.entry === 'string' ? raw.entry.trim() : 'index.js'
      const styles = Array.isArray(raw.styles)
        ? raw.styles.filter((s): s is string => typeof s === 'string' && isSafeRelAsset(s.trim())).map((s) => s.trim())
        : []

      if (!id || !isSafeRelAsset(entry)) continue
      const entryFile = join(pluginRoot, entry)
      if (!existsSync(entryFile)) continue
      const entryStat = statSync(entryFile)
      if (!entryStat.isFile()) continue

      const encDir = encodeURIComponent(dir)
      const encodeRel = (p: string) => p.split('/').map(encodeURIComponent).join('/')
      const versionTag = (filePath: string, preStat?: ReturnType<typeof statSync>) => {
        const st = preStat ?? statSync(filePath)
        return Math.floor(st.mtimeMs)
      }
      out.push({
        id,
        name,
        version,
        dir,
        entryUrl: `/plugins/${encDir}/${encodeRel(entry)}?v=${versionTag(entryFile, entryStat)}`,
        styleUrls: styles
          .filter((s) => {
            const p = join(pluginRoot, s)
            return existsSync(p) && statSync(p).isFile()
          })
          .map((s) => `/plugins/${encDir}/${encodeRel(s)}?v=${versionTag(join(pluginRoot, s))}`),
      })
    } catch {
      // 跳过损坏的 manifest，不影响其它插件和主程序启动
    }
  }
  return out
}

/** 注册外部插件清单 API（GET /api/plugins）与插件静态文件托管（GET /plugins/:dir/*）。 */
export function registerPluginRoutes(app: Hono, pluginsDir?: string): void {
  app.get('/api/plugins', (c) => {
    c.header('Cache-Control', 'no-store')
    return c.json({ plugins: listExternalPlugins(pluginsDir) })
  })

  app.get('/plugins/:dir/*', (c) => {
    if (!pluginsDir || !existsSync(pluginsDir)) {
      return c.text('Not found', 404)
    }

    const dir = c.req.param('dir')
    if (!SAFE_DIR_RE.test(dir) || dir.startsWith('.')) {
      return c.text('Not found', 404)
    }

    const prefix = `/plugins/${dir}/`
    let relPath: string
    try {
      const decodedPath = decodeURIComponent(c.req.path)
      relPath = decodedPath.startsWith(prefix) ? decodedPath.slice(prefix.length) : ''
    } catch {
      return c.text('Bad Request', 400)
    }

    if (!isSafeRelAsset(relPath)) {
      return c.text('Forbidden', 403)
    }

    try {
      const realRoot = realpathSync(pluginsDir)
      const pluginDir = join(pluginsDir, dir)
      if (!existsSync(pluginDir) || !statSync(pluginDir).isDirectory()) {
        return c.text('Not found', 404)
      }
      const realPluginDir = realpathSync(pluginDir)
      if (!realPluginDir.startsWith(realRoot + sep)) {
        return c.text('Forbidden', 403)
      }

      const target = join(realPluginDir, relPath)
      if (!existsSync(target) || !statSync(target).isFile()) {
        return c.text('Not found', 404)
      }
      const realTarget = realpathSync(target)
      if (!realTarget.startsWith(realPluginDir + sep)) {
        return c.text('Forbidden', 403)
      }

      const ext = extname(realTarget).toLowerCase()
      const type = PLUGIN_MIME[ext]
      if (!type) return c.text('Unsupported type', 415)

      c.header('Content-Type', type)
      c.header('Cache-Control', 'no-store')
      return c.body(readFileSync(realTarget))
    } catch {
      return c.text('Not found', 404)
    }
  })
}
