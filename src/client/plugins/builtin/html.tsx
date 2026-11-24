import SitePreview from '../../components/SitePreview.js'
import type { VmdPlugin } from '../types.js'

function parentDirOf(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? norm.slice(0, idx) : ''
}

/** 独立 HTML 文件内置插件：支持网页 iframe 预览与源码编辑切换 */
export const htmlPlugin: VmdPlugin<null> = {
  id: 'builtin.html',
  name: 'HTML 网页',
  priority: 40,
  target: 'file',
  icon: 'file-code',
  supportsSource: true,

  matchPath: ({ ext }) => ext === '.html' || ext === '.htm',

  modes: [{ id: 'preview', label: '网页' }],
  defaultMode: 'preview',

  renderMain({ filePath, fileName }) {
    return <SitePreview dir={parentDirOf(filePath)} entry={fileName} title={fileName} />
  },
}
