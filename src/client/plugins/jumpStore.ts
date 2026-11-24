/**
 * 通用跨视图跳转槽位（列视图 → 文件主视图）。
 * 插件在列视图点击具体条目时写入一次性 payload，主视图打开对应文件后按 pluginId 消费并定位。
 */

interface JumpSlot {
  pluginId: string
  path: string
  payload: unknown
}

let slot: JumpSlot | null = null

export function setPluginJump(pluginId: string, path: string, payload: unknown): void {
  slot = { pluginId, path, payload }
}

export function peekPluginJump(pluginId: string, path: string): boolean {
  return slot?.pluginId === pluginId && slot?.path === path
}

export function hasPendingPluginJump(path: string): boolean {
  return slot?.path === path
}

export function takePluginJump<T = unknown>(pluginId: string, path: string): T | null {
  if (!slot) return null
  if (slot.path !== path || slot.pluginId !== pluginId) {
    if (slot.path !== path) slot = null
    return null
  }
  const payload = slot.payload as T
  slot = null
  return payload
}

export function clearPluginJump(): void {
  slot = null
}
