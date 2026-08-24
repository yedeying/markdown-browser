/**
 * CodeMirror 语言扩展映射
 *
 * 从 Editor.tsx 抽出来单独成模块，为的是能直接单测：
 * legacy-modes 里各语言的导出形态并不统一 —— 多数直接导出 StreamParser 对象，
 * 但 sql / python 导出的是接受配置的工厂函数。把工厂函数交给
 * StreamLanguage.define 不会在构造时报错，而是等到 EditorState.create
 * 真正解析首行时才抛 "t is not a function"，在 UI 上表现为文件打不开。
 * 只有逐个语言构造一次 state 才能挡住这类错配。
 */
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { python } from '@codemirror/legacy-modes/mode/python'
import { go } from '@codemirror/legacy-modes/mode/go'
import { rust } from '@codemirror/legacy-modes/mode/rust'
// 注意是 standardSQL 而不是 sql：后者是接受方言配置的工厂函数，
// 直接交给 StreamLanguage.define 会得到一个没有 token 方法的"解析器"。
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { perl } from '@codemirror/legacy-modes/mode/perl'
import { cmake } from '@codemirror/legacy-modes/mode/cmake'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import {
  c, cpp, java, csharp, kotlin, scala, objectiveC, objectiveCpp, dart,
} from '@codemirror/legacy-modes/mode/clike'
import { swift } from '@codemirror/legacy-modes/mode/swift'
import { lua } from '@codemirror/legacy-modes/mode/lua'
import { r } from '@codemirror/legacy-modes/mode/r'
import { haskell } from '@codemirror/legacy-modes/mode/haskell'
import { groovy } from '@codemirror/legacy-modes/mode/groovy'
import { clojure } from '@codemirror/legacy-modes/mode/clojure'
import { sass } from '@codemirror/legacy-modes/mode/sass'
import type { Extension } from '@codemirror/state'

/** getEditorLang 可能返回的全部取值，加上 undefined（按 markdown 处理） */
export const EDITOR_LANGUAGES = [
  'markdown',
  'javascript',
  'typescript',
  'css',
  'html',
  'json',
  'shell',
  'yaml',
  'python',
  'go',
  'rust',
  'sql',
  'toml',
  'dockerfile',
  'ruby',
  'perl',
  'cmake',
  'properties',
  'powershell',
  'c',
  'cpp',
  'java',
  'csharp',
  'kotlin',
  'scala',
  'objectivec',
  'objectivecpp',
  'dart',
  'swift',
  'lua',
  'r',
  'haskell',
  'groovy',
  'clojure',
  'sass',
  'plaintext',
] as const

export function getLangExtension(language?: string): Extension {
  switch (language) {
    case 'javascript': return javascript()
    case 'typescript': return javascript({ typescript: true })
    case 'css':        return css()
    case 'html':       return html()
    case 'json':       return javascript()  // JSON 用 JS 高亮够用
    case 'shell':      return StreamLanguage.define(shell)
    case 'yaml':       return StreamLanguage.define(yaml)
    case 'python':     return StreamLanguage.define(python)
    case 'go':         return StreamLanguage.define(go)
    case 'rust':       return StreamLanguage.define(rust)
    case 'sql':        return StreamLanguage.define(standardSQL)
    case 'toml':       return StreamLanguage.define(toml)
    case 'dockerfile': return StreamLanguage.define(dockerFile)
    case 'ruby':       return StreamLanguage.define(ruby)
    case 'perl':       return StreamLanguage.define(perl)
    case 'cmake':      return StreamLanguage.define(cmake)
    case 'properties': return StreamLanguage.define(properties)
    case 'powershell': return StreamLanguage.define(powerShell)
    case 'c':          return StreamLanguage.define(c)
    case 'cpp':        return StreamLanguage.define(cpp)
    case 'java':       return StreamLanguage.define(java)
    case 'csharp':     return StreamLanguage.define(csharp)
    case 'kotlin':     return StreamLanguage.define(kotlin)
    case 'scala':      return StreamLanguage.define(scala)
    case 'objectivec': return StreamLanguage.define(objectiveC)
    case 'objectivecpp': return StreamLanguage.define(objectiveCpp)
    case 'dart':       return StreamLanguage.define(dart)
    case 'swift':      return StreamLanguage.define(swift)
    case 'lua':        return StreamLanguage.define(lua)
    case 'r':          return StreamLanguage.define(r)
    case 'haskell':    return StreamLanguage.define(haskell)
    case 'groovy':     return StreamLanguage.define(groovy)
    case 'clojure':    return StreamLanguage.define(clojure)
    case 'sass':       return StreamLanguage.define(sass)
    case 'plaintext':  return []
    default:           return markdown()    // 默认 markdown（含 undefined）
  }
}
