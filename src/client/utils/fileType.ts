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

const TEXT_EXTS = new Set(['.txt', '.log', '.csv', '.tsv', '.xml', '.jsonl'])

/** 常见无后缀 / 特殊 basename → 编辑器语言（小写 key） */
const KNOWN_BASENAME_LANG: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'shell',
  gnumakefile: 'shell',
  bsdmakefile: 'shell',
  justfile: 'shell',
  procfile: 'shell',
  gemfile: 'ruby',
  'gemfile.lock': 'ruby',
  rakefile: 'ruby',
  vagrantfile: 'ruby',
  brewfile: 'ruby',
  guardfile: 'ruby',
  capfile: 'ruby',
  podfile: 'ruby',
  fastfile: 'ruby',
  appfile: 'ruby',
  thorfile: 'ruby',
  berksfile: 'ruby',
  'cmakelists.txt': 'cmake',
  'go.mod': 'go',
  'go.sum': 'go',
  pipfile: 'toml',
  'pipfile.lock': 'json',
  // 点文件无「后缀」，getExtension 会得到 null
  '.gitignore': 'shell',
  '.dockerignore': 'shell',
  '.gitattributes': 'shell',
  '.editorconfig': 'properties',
  '.npmrc': 'properties',
  '.yarnrc': 'properties',
  '.env': 'shell',
}

function getBasename(path: string): string {
  return path.split('/').pop() ?? path
}

function getExtension(path: string): string | null {
  const base = getBasename(path)
  const dotIdx = base.lastIndexOf('.')
  if (dotIdx <= 0) return null
  return base.slice(dotIdx).toLowerCase()
}

/** 按文件名识别语言；识别不到返回 null */
export function langFromBasename(path: string): string | null {
  const base = getBasename(path)
  const lower = base.toLowerCase()
  const known = KNOWN_BASENAME_LANG[lower]
  if (known) return known
  // Dockerfile.prod / Containerfile.dev 等变体
  if (
    lower.startsWith('dockerfile.') ||
    lower.startsWith('containerfile.')
  ) {
    return 'dockerfile'
  }
  if (lower.startsWith('.env.')) return 'shell'
  return null
}

/**
 * 从首行 shebang 推断语言。
 * 例：#!/usr/bin/env bash、#!/bin/sh、#!/usr/bin/python3
 */
export function langFromShebang(content: string): string | null {
  const first = content.split(/\r?\n/, 1)[0] ?? ''
  if (!first.startsWith('#!')) return null
  const line = first.slice(2).trim()
  const envMatch = line.match(/(?:^|\/)env\s+(\S+)/)
  const raw = envMatch?.[1] ?? line.split(/\s+/)[0] ?? ''
  const prog = raw.split('/').pop()?.toLowerCase() ?? ''
  if (!prog) return null

  if (/^(ba|da|a|z|k|fi)?sh$|^fish$/.test(prog)) return 'shell'
  if (/^python(\d+(\.\d+)?)?$/.test(prog)) return 'python'
  if (/^(node|nodejs|bun|deno)$/.test(prog)) return 'javascript'
  if (/^(ts-node|tsx)$/.test(prog)) return 'typescript'
  if (/^ruby\d*$/.test(prog)) return 'ruby'
  if (/^perl\d*$/.test(prog)) return 'perl'
  if (/^(pwsh|powershell)$/.test(prog)) return 'powershell'
  if (/^php\d*$/.test(prog)) return 'html'
  return null
}

export function getFileType(path: string): FileType {
  const ext = getExtension(path)
  // 已知特殊名（Dockerfile 等）按代码处理，便于图标与路由
  if (langFromBasename(path)) return 'code'
  // 无后缀：按纯文本尝试预览（可再靠 shebang 高亮）
  if (!ext) return 'text'
  if (MD_EXTS.has(ext))    return 'markdown'
  if (CODE_EXTS.has(ext))  return 'code'
  if (TEXT_EXTS.has(ext))  return 'text'
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'text'
}

/** 已加载文本是否含 NUL，视为二进制不可预览 */
export function isBinaryContent(content: string): boolean {
  return content.includes('\0')
}

/**
 * 返回 CodeMirror 语言 key。
 * @param content 可选；无后缀或不识别扩展名时用于 shebang 推断
 */
export function getEditorLang(path: string, content?: string | null): string {
  const byName = langFromBasename(path)
  if (byName) return byName

  const ext = getExtension(path)
  if (ext) {
    if (['.js', '.jsx'].includes(ext))                          return 'javascript'
    if (['.ts', '.tsx'].includes(ext))                          return 'typescript'
    if (['.css'].includes(ext))                                 return 'css'
    if (['.html', '.htm', '.vue', '.svelte'].includes(ext))     return 'html'
    if (['.json', '.jsonl'].includes(ext))                      return 'json'
    if (['.sh', '.bash', '.zsh'].includes(ext))                 return 'shell'
    if (['.yaml', '.yml'].includes(ext))                        return 'yaml'
    if (['.py'].includes(ext))                                  return 'python'
    if (['.go'].includes(ext))                                  return 'go'
    if (['.rs'].includes(ext))                                  return 'rust'
    if (['.sql'].includes(ext))                                 return 'sql'
    if (['.toml'].includes(ext))                                return 'toml'
    if (['.rb'].includes(ext))                                  return 'ruby'
    if (['.dockerfile'].includes(ext))                          return 'dockerfile'
    if (['.pl', '.pm'].includes(ext))                           return 'perl'
    // 未知扩展名：再试 shebang
  }

  if (typeof content === 'string' && content) {
    const byShebang = langFromShebang(content)
    if (byShebang) return byShebang
  }

  return 'plaintext'
}

/** 是否为可编辑的文本类文件（非图片/视频） */
export function isEditable(path: string): boolean {
  const ft = getFileType(path)
  return ft === 'markdown' || ft === 'code' || ft === 'text'
}

/** 是否为 .jsonl 文件（集中判断，供 ContentArea 等处按扩展名路由到 ST/逐行预览）。 */
export function isJsonlPath(path: string | null | undefined): boolean {
  return !!path && getExtension(path) === '.jsonl'
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
