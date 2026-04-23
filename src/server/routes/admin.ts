/**
 * 挂载点管理 API（/api/admin/*）
 *
 * 鉴权：复用访问密码 cookie（由父 app 的 createAuthMiddleware 拦截）
 *   - 无访问密码时：所有端点公开，方便本地使用
 *   - 有访问密码时：登录用户即可管理挂载点
 */
import { Hono } from 'hono'
import type { AuthConfig } from '../../types.js'
import type { MountManager } from '../mount-manager.js'

export function createAdminRoutes(
  app: Hono,
  mountManager: MountManager,
  authConfig: AuthConfig | null,
) {
  // 管理功能总是启用；是否登录由前端根据 /api/mounts 访问是否 401 自行判断
  app.get('/api/admin/status', (c) => {
    return c.json({
      enabled: true,
      requiresLogin: !!authConfig,
      workspace: mountManager.getWorkspace(),
      configPath: mountManager.getConfigPath(),
    })
  })

  // 列出挂载点（详细含 path）
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
