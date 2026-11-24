import type { ComponentChildren } from 'preact'
import type { FileNode } from '../../types.js'
import type { IconName } from '../components/ui/Icon.js'

export interface PluginModeDef {
  id: string
  label: string
}

export interface PluginSettingOption {
  value: string
  label: string
}

export interface PluginSettingDef {
  key: string
  label: string
  type: 'select' | 'toggle'
  options?: ReadonlyArray<PluginSettingOption>
  defaultValue: string | boolean
  /** 是否在顶部工具栏及移动端菜单中渲染快捷控件 */
  inToolbar?: boolean
  /** 仅在指定 mode 激活时在工具栏显示 */
  toolbarModes?: string[]
}

export interface MatchPathContext {
  path: string
  name: string
  ext: string
  isFolder: boolean
  children?: FileNode[]
}

export interface SniffContext {
  path: string
  name: string
  content: string
  compact?: boolean
}

export interface RenderMainContext<TParsed = unknown> {
  filePath: string
  fileName: string
  content: string
  parsed: TParsed
  mode: string
  theme: 'dark' | 'light'
  node: FileNode | null
  contentBodyRef: { current: HTMLElement | null }
  previewContentRef: { current: HTMLElement | null }
  onSave?: (content: string) => Promise<void>
  onCheckboxToggle?: (index: number, checked: boolean) => void
  onSelectNode?: (node: FileNode) => void
  mediaPlaylist?: FileNode[]
  onMediaNavigate?: (path: string) => void
}

export interface RenderColumnContext<TParsed = unknown> {
  node: FileNode
  content: string
  parsed: TParsed
  onOpenFile: (node: FileNode) => void
}

export interface RenderTocContext<TParsed = unknown> {
  filePath: string
  parsed: TParsed
  mode: string
  scrollContainerRef: { current: HTMLElement | null }
  previewContentRef: { current: HTMLElement | null }
}

export interface RenderFolderContext {
  node: FileNode
  mode: string
}

export interface VmdPlugin<TParsed = unknown> {
  id: string
  name: string
  /** 匹配优先级：数值越大越优先（外部专用插件推荐 100，内置 10~50，兜底 0） */
  priority: number
  target: 'file' | 'folder'
  icon?: IconName
  /** 文件插件是否需要宿主先拉取文本内容（媒体类为 false，默认 true） */
  requiresContent?: boolean
  /** 是否支持切入 CodeMirror 源码模式 */
  supportsSource?: boolean
  /** 是否支持左右分栏编辑（如 Markdown） */
  supportsSplitEdit?: boolean
  /** 纯编辑器类插件（默认直接以 CodeMirror 打开，无独立预览视图） */
  editorOnly?: boolean

  matchPath(ctx: MatchPathContext): boolean
  /** 可选内容嗅探与解析；返回 null 表示放弃命中，继续尝试更低优先级插件 */
  sniffAndParse?(ctx: SniffContext): TParsed | null

  /** 预览态子模式；宿主自动在顶栏与移动端菜单渲染切换控件 */
  modes?: PluginModeDef[]
  defaultMode?: string
  /** 声明式设置项；宿主自动接入 localStorage、设置弹窗与顶栏快捷入口 */
  settings?: PluginSettingDef[]

  renderMain?(ctx: RenderMainContext<TParsed>): ComponentChildren
  renderFolder?(ctx: RenderFolderContext): ComponentChildren
  renderColumnPreview?(ctx: RenderColumnContext<TParsed>): ComponentChildren
  renderToc?(ctx: RenderTocContext<TParsed>): ComponentChildren

  /** 列视图带 jumpState 跳转进主视图后的定位回调；返回 true 表示已完成定位 */
  onConsumeJump?(ctx: { path: string; payload: unknown; container: HTMLElement }): boolean | void
}

export interface ResolvedFilePlugin<TParsed = unknown> {
  plugin: VmdPlugin<TParsed>
  parsed: TParsed
}
