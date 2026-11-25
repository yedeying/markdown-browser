import { pluginRegistry } from '../registry.js'
import { markdownPlugin } from './markdown.js'
import { htmlPlugin } from './html.js'
import { imagePlugin, videoPlugin } from './media.js'
import { pdfPlugin } from './pdf.js'
import { jsonlPlugin } from './jsonl.js'
import { codePlugin, plaintextPlugin } from './code.js'
import { siteFolderPlugin } from './siteFolder.js'

let registered = false

/** 注册所有内置文件与文件夹插件（幂等） */
export function registerBuiltinPlugins(): void {
  if (registered) return
  registered = true
  pluginRegistry.register(markdownPlugin)
  pluginRegistry.register(htmlPlugin)
  pluginRegistry.register(imagePlugin)
  pluginRegistry.register(videoPlugin)
  pluginRegistry.register(pdfPlugin)
  pluginRegistry.register(jsonlPlugin)
  pluginRegistry.register(codePlugin)
  pluginRegistry.register(plaintextPlugin)
  pluginRegistry.register(siteFolderPlugin)
}
