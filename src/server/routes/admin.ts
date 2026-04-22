/**
 * 管理后台 API（/api/admin/*）
 *
 * - 独立的管理员密码认证（cookie：vmd_admin_session）
 * - 仅当启动时配置了 admin password 才启用 CRUD 端点
 * - 未配置时所有写操作返回 403，配置面板只读
 */
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { AuthConfig } from '../../types.js'
import type { MountManager } from '../mount-manager.js'

const ADMIN_COOKIE = 'vmd_admin_session'

async function getCryptoKey(key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  )
}

function toBase64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signPayload(payload: string, key: Uint8Array): Promise<string> {
  const cryptoKey = await getCryptoKey(key)
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(payload))
  return toBase64url(sig)
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const bufA = enc.encode(a)
  const bufB = enc.encode(b)
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

async function createAdminToken(config: AuthConfig): Promise<string> {
  const payload = toBase64url(new TextEncoder().encode(JSON.stringify({ ts: Date.now(), role: 'admin' })))
  const sig = await signPayload(payload, config.signingKey)
  return `${payload}.${sig}`
}

async function verifyAdminToken(token: string, config: AuthConfig): Promise<boolean> {
  const dotIdx = token.lastIndexOf('.')
  if (dotIdx === -1) return false
  const payload = token.slice(0, dotIdx)
  const sig = token.slice(dotIdx + 1)
  const expected = await signPayload(payload, config.signingKey)
  if (!timingSafeEqual(sig, expected)) return false
  try {
    const json = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
      )
    ) as { ts: number; role: string }
    if (json.role !== 'admin') return false
    if (Date.now() - json.ts > config.maxAge * 1000) return false
  } catch {
    return false
  }
  return true
}

function adminAuthMiddleware(config: AuthConfig) {
  return async (c: Context, next: Next) => {
    // /api/admin/login 自身不需要鉴权
    if (c.req.path === '/api/admin/login') return next()
    const token = getCookie(c, ADMIN_COOKIE)
    if (!token || !(await verifyAdminToken(token, config))) {
      return c.json({ error: 'Unauthorized', code: 'ADMIN_AUTH_REQUIRED' }, 401)
    }
    return next()
  }
}

/**
 * 注册 /api/admin/* 路由到父 app
 */
export function createAdminRoutes(
  app: Hono,
  mountManager: MountManager,
  adminAuth: AuthConfig | null,
) {
  // 管理 API 状态（前端判断是否支持在线编辑）
  app.get('/api/admin/status', (c) => {
    return c.json({
      enabled: !!adminAuth,
      loggedIn: !!adminAuth && !!getCookie(c, ADMIN_COOKIE),
      workspace: mountManager.getWorkspace(),
      configPath: mountManager.getConfigPath(),
    })
  })

  // 未开启管理员密码：所有写操作返回 403
  if (!adminAuth) {
    app.all('/api/admin/*', (c) => {
      if (c.req.path === '/api/admin/status') return c.json({ enabled: false })
      return c.json({ error: '管理功能未启用，请设置 VMD_ADMIN_PASSWORD 环境变量', code: 'ADMIN_DISABLED' }, 403)
    })
    return
  }

  // 登录
  app.post('/api/admin/login', async (c) => {
    let body: Record<string, unknown> = {}
    try { body = await c.req.json() } catch { /* ignore */ }
    const pw = typeof body.password === 'string' ? body.password : ''
    if (!pw) return c.json({ error: '请输入密码' }, 400)

    const enc = new TextEncoder()
    const inputBuf = enc.encode(pw)
    const correctBuf = enc.encode(adminAuth.password)
    let ok = false
    if (inputBuf.length === correctBuf.length) {
      ok = crypto.timingSafeEqual(inputBuf, correctBuf)
    } else {
      crypto.timingSafeEqual(correctBuf, correctBuf)
    }
    if (!ok) return c.json({ error: '密码错误' }, 401)

    const token = await createAdminToken(adminAuth)
    setCookie(c, ADMIN_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: adminAuth.maxAge,
    })
    return c.json({ ok: true })
  })

  // 登出
  app.post('/api/admin/logout', (c) => {
    deleteCookie(c, ADMIN_COOKIE, { path: '/' })
    return c.json({ ok: true })
  })

  // 以下所有路由需要管理员认证
  app.use('/api/admin/*', adminAuthMiddleware(adminAuth))

  // 列出挂载点（详细）
  app.get('/api/admin/mounts', (c) => {
    return c.json({
      mounts: mountManager.list(),
      workspace: mountManager.getWorkspace(),
    })
  })

  // 新增
  app.post('/api/admin/mounts', async (c) => {
    try {
      const body = await c.req.json() as { alias: string; name: string; path: string; readonly?: boolean }
      const res = mountManager.add({
        alias: body.alias,
        name: body.name,
        path: body.path,
        readonly: body.readonly,
      })
      if (!res.ok) return c.json({ ok: false, error: res.error }, 400)
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // 更新
  app.put('/api/admin/mounts/:alias', async (c) => {
    try {
      const alias = c.req.param('alias')
      const body = await c.req.json() as { name?: string; path?: string; readonly?: boolean }
      const res = mountManager.update(alias, body)
      if (!res.ok) return c.json({ ok: false, error: res.error }, 400)
      return c.json({ ok: true })
    } catch (e) {
      return c.json({ ok: false, error: String(e) }, 400)
    }
  })

  // 删除
  app.delete('/api/admin/mounts/:alias', (c) => {
    const alias = c.req.param('alias')
    const res = mountManager.remove(alias)
    if (!res.ok) return c.json({ ok: false, error: res.error }, 400)
    return c.json({ ok: true })
  })
}
