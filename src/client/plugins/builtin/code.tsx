import { getFileType } from '../../utils/fileType.js'
import type { VmdPlugin } from '../types.js'

/** 代码与配置文件编辑器插件（内部委托给 editorLang 语言注册表：js/ts/vue/py/go/rust/...） */
export const codePlugin: VmdPlugin<null> = {
  id: 'builtin.code',
  name: '代码编辑器',
  priority: 10,
  target: 'file',
  icon: 'file-code',
  editorOnly: true,
  supportsSource: true,

  matchPath: ({ name }) => getFileType(name) === 'code',
}

/** 纯文本兜底编辑器插件 */
export const plaintextPlugin: VmdPlugin<null> = {
  id: 'builtin.plaintext',
  name: '纯文本',
  priority: 0,
  target: 'file',
  icon: 'file-text',
  editorOnly: true,
  supportsSource: true,

  matchPath: ({ name }) => getFileType(name) === 'text',
}
