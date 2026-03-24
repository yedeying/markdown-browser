export type FileType = 'markdown' | 'code' | 'image' | 'video' | 'text' | 'unsupported'

const MD_EXTS = new Set(['.md', '.markdown'])

const CODE_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.htm',
  '.py', '.json', '.sh', '.bash', '.zsh',
  '.yaml', '.yml', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.php',
  '.rb', '.swift', '.kt', '.vue', '.svelte',
  '.sql', '.toml', '.ini', '.conf', '.env',
  '.dockerfile', '.makefile',
])

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'])

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.ogg', '.mov', '.avi'])

const TEXT_EXTS = new Set(['.txt', '.log', '.csv', '.tsv', '.xml'])

export function getFileType(path: string): FileType {
  const dotIdx = path.lastIndexOf('.')
  if (dotIdx === -1) return 'unsupported'
  const ext = path.slice(dotIdx).toLowerCase()
  if (MD_EXTS.has(ext))    return 'markdown'
  if (CODE_EXTS.has(ext))  return 'code'
  if (TEXT_EXTS.has(ext))  return 'text'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'unsupported'
}

/** 返回 CodeMirror 语言 key，用于 Editor 选择语言扩展 */
export function getEditorLang(path: string): string {
  const dotIdx = path.lastIndexOf('.')
  if (dotIdx === -1) return 'plaintext'
  const ext = path.slice(dotIdx).toLowerCase()
  if (['.js', '.jsx'].includes(ext))                          return 'javascript'
  if (['.ts', '.tsx'].includes(ext))                          return 'typescript'
  if (['.css'].includes(ext))                                 return 'css'
  if (['.html', '.htm', '.vue', '.svelte'].includes(ext))     return 'html'
  if (['.json'].includes(ext))                                return 'json'
  if (['.sh', '.bash', '.zsh'].includes(ext))                 return 'shell'
  if (['.yaml', '.yml'].includes(ext))                        return 'yaml'
  if (['.py'].includes(ext))                                  return 'python'
  if (['.go'].includes(ext))                                  return 'go'
  if (['.rs'].includes(ext))                                  return 'rust'
  if (['.sql'].includes(ext))                                 return 'sql'
  if (['.toml'].includes(ext))                                return 'toml'
  return 'plaintext'
}

/** 是否为可编辑的文本类文件（非图片/视频） */
export function isEditable(path: string): boolean {
  const ft = getFileType(path)
  return ft === 'markdown' || ft === 'code' || ft === 'text'
}

/** 服务端用：所有支持的文件扩展名（用于文件树过滤） */
export const ALL_SUPPORTED_EXTS = new Set([
  ...MD_EXTS,
  ...CODE_EXTS,
  ...IMAGE_EXTS,
  ...VIDEO_EXTS,
  ...TEXT_EXTS,
])

/** 服务端用：不可保存的二进制扩展名 */
export const BINARY_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS])
