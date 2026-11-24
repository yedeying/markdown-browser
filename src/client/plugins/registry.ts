import { useEffect, useState } from 'preact/hooks'
import type { FileNode } from '../../types.js'
import type { IconName } from '../components/ui/Icon.js'
import type { MatchPathContext, ResolvedFilePlugin, VmdPlugin } from './types.js'

export function extractExt(nameOrPath: string): string {
  const base = nameOrPath.split('/').pop() ?? nameOrPath
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot).toLowerCase()
}

export class PluginRegistry {
  private plugins: VmdPlugin<any>[] = []
  private version = 0
  private listeners = new Set<() => void>()

  private notify() {
    this.version++
    for (const fn of this.listeners) fn()
  }

  getVersion(): number {
    return this.version
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  register(plugin: VmdPlugin<any>): void {
    const idx = this.plugins.findIndex((p) => p.id === plugin.id)
    if (idx >= 0) this.plugins[idx] = plugin
    else this.plugins.push(plugin)
    this.plugins.sort((a, b) => b.priority - a.priority)
    this.notify()
  }

  unregister(id: string): void {
    const before = this.plugins.length
    this.plugins = this.plugins.filter((p) => p.id !== id)
    if (this.plugins.length !== before) this.notify()
  }

  getAll(): ReadonlyArray<VmdPlugin<any>> {
    return this.plugins
  }

  getById(id: string): VmdPlugin<any> | undefined {
    return this.plugins.find((p) => p.id === id)
  }

  /** 阶段 1：按路径初筛文件插件（零 IO，供文件树图标与是否读取正文使用） */
  matchFileByPath(path: string): VmdPlugin<any> | null {
    const name = path.split('/').pop() ?? path
    const ctx: MatchPathContext = { path, name, ext: extractExt(name), isFolder: false }
    for (const plugin of this.plugins) {
      if (plugin.target !== 'file') continue
      if (plugin.matchPath(ctx)) return plugin
    }
    return null
  }

  /** 是否存在任意命中该路径且不要求文本内容的媒体类插件 */
  requiresContentForPath(path: string): boolean {
    const name = path.split('/').pop() ?? path
    const ctx: MatchPathContext = { path, name, ext: extractExt(name), isFolder: false }
    for (const plugin of this.plugins) {
      if (plugin.target !== 'file') continue
      if (!plugin.matchPath(ctx)) continue
      if (plugin.requiresContent === false) return false
      return true
    }
    return true
  }

  /** 阶段 1 + 2：结合路径与内容按优先级解析最终生效的文件插件 */
  resolveFile(path: string, content: string | null, opts?: { compact?: boolean }): ResolvedFilePlugin | null {
    const name = path.split('/').pop() ?? path
    const pathCtx: MatchPathContext = { path, name, ext: extractExt(name), isFolder: false }

    for (const plugin of this.plugins) {
      if (plugin.target !== 'file') continue
      if (!plugin.matchPath(pathCtx)) continue

      if (plugin.sniffAndParse) {
        if (content === null) continue
        try {
          const parsed = plugin.sniffAndParse({ path, name, content, compact: opts?.compact })
          if (parsed !== null && parsed !== undefined) {
            return { plugin, parsed }
          }
        } catch (err) {
          console.error(`[vmd:plugin] ${plugin.id} sniffAndParse failed:`, err)
        }
        continue
      }

      return { plugin, parsed: null }
    }
    return null
  }

  /** 解析命中当前文件夹的插件（如含 index.html 的静态站点预览） */
  resolveFolder(node: FileNode | null): VmdPlugin<any> | null {
    if (!node || node.type !== 'folder') return null
    const ctx: MatchPathContext = {
      path: node.path,
      name: node.name,
      ext: '',
      isFolder: true,
      children: node.children,
    }
    for (const plugin of this.plugins) {
      if (plugin.target !== 'folder') continue
      try {
        if (plugin.matchPath(ctx)) return plugin
      } catch (err) {
        console.error(`[vmd:plugin] ${plugin.id} matchPath failed:`, err)
      }
    }
    return null
  }

  /** 文件树图标：优先采用最高优先级命中插件的 icon */
  getIconForFile(name: string): IconName | null {
    const plugin = this.matchFileByPath(name)
    return plugin?.icon ?? null
  }

  /** 收集所有声明了可配置设置项的插件（供 SettingsDialog 动态渲染） */
  getPluginsWithSettings(): VmdPlugin<any>[] {
    return this.plugins.filter((p) => Array.isArray(p.settings) && p.settings.length > 0)
  }
}

export const pluginRegistry = new PluginRegistry()

/** 订阅插件注册表变更（外部插件异步加载完成后自动触发宿主重渲染） */
export function usePluginsVersion(): number {
  const [v, setV] = useState(() => pluginRegistry.getVersion())
  useEffect(() => pluginRegistry.subscribe(() => setV(pluginRegistry.getVersion())), [])
  return v
}
