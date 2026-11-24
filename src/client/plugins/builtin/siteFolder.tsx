import SitePreview from '../../components/SitePreview.js'
import type { VmdPlugin } from '../types.js'

/** 文件夹静态站点插件：目录内存在 index.html/index.htm 时提供「文件 / 网页」视图切换 */
export const siteFolderPlugin: VmdPlugin<null> = {
  id: 'builtin.site-folder',
  name: '静态站点预览',
  priority: 50,
  target: 'folder',

  matchPath: ({ isFolder, path, children }) =>
    isFolder &&
    !!path &&
    !!children?.some((c) => c.type === 'file' && /^index\.html?$/i.test(c.name)),

  modes: [
    { id: 'folder', label: '文件' },
    { id: 'web', label: '网页' },
  ],
  defaultMode: 'folder',

  renderFolder({ node }) {
    const entry = node.children?.find((c) => c.type === 'file' && /^index\.html?$/i.test(c.name))?.name || 'index.html'
    return <SitePreview dir={node.path} entry={entry} title={node.name} />
  },
}
