import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', json)

/** Pretty-printed JSON → highlight.js HTML（仅 JSON 语言）。 */
export function highlightJson(code: string): string {
  return hljs.highlight(code, { language: 'json' }).value
}
