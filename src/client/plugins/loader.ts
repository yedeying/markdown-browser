import type { ExternalPluginManifest } from '../../types.js'
import { pluginRegistry } from './registry.js'
import { installPluginSdk } from './sdk.js'
import type { VmdPlugin } from './types.js'

const loadedPluginIds = new Set<string>()

function injectPluginStylesheet(id: string, href: string): void {
  const domId = `vmd-plugin-style-${id}-${href.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  if (document.getElementById(domId)) return
  const link = document.createElement('link')
  link.id = domId
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
}

/**
 * 从服务端 GET /api/plugins 发现并加载外部运行时插件。
 * 单个插件失败不会影响其它插件和主应用启动。
 */
export async function loadExternalPlugins(): Promise<void> {
  const sdk = installPluginSdk()
  let manifests: ExternalPluginManifest[] = []
  try {
    const res = await fetch('/api/plugins', { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json() as { plugins?: ExternalPluginManifest[] }
    if (Array.isArray(data.plugins)) manifests = data.plugins
  } catch {
    return
  }

  await Promise.all(
    manifests.map(async (manifest) => {
      if (loadedPluginIds.has(manifest.id)) return
      try {
        for (const cssUrl of manifest.styleUrls) {
          injectPluginStylesheet(manifest.id, cssUrl)
        }
        // 使用原生 ESM 动态导入（viteIgnore 防止构建期静态重写运行时 URL）
        const mod = await import(/* @vite-ignore */ manifest.entryUrl)
        const exported = mod?.default ?? mod?.plugin
        const resolved = typeof exported === 'function' ? exported(sdk) : exported
        const list: VmdPlugin<any>[] = Array.isArray(resolved) ? resolved : resolved ? [resolved] : []
        for (const plugin of list) {
          if (plugin && typeof plugin.id === 'string' && typeof plugin.matchPath === 'function') {
            pluginRegistry.register(plugin)
          }
        }
        loadedPluginIds.add(manifest.id)
      } catch (err) {
        console.error(`[vmd:plugins] Failed to load external plugin "${manifest.id}":`, err)
      }
    }),
  )
}
