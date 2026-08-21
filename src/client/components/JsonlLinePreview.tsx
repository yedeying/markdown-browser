import type { FunctionalComponent } from 'preact'
import { highlightJson } from '../utils/highlightJson.js'

interface LineEntry {
  lineNumber: number
  error: boolean
  text: string
}

/**
 * 逐行解析 JSONL：合法 JSON 对象/值 pretty-print 展示；
 * 非法行保留原文并标为错误行。空白行忽略，不占卡片。
 */
function buildLines(content: string): LineEntry[] {
  const rawLines = content.split(/\r\n|\r|\n/)
  const entries: LineEntry[] = []
  rawLines.forEach((raw, idx) => {
    if (!raw.trim()) return
    try {
      const parsed = JSON.parse(raw)
      entries.push({ lineNumber: idx + 1, error: false, text: JSON.stringify(parsed, null, 2) })
    } catch {
      entries.push({ lineNumber: idx + 1, error: true, text: raw })
    }
  })
  return entries
}

interface Props {
  content: string
}

/** 普通 JSONL 逐行预览：每行一张卡片（行号 + pretty-print + JSON 高亮），非法 JSON 行原样展示并标红。 */
const JsonlLinePreview: FunctionalComponent<Props> = ({ content }) => {
  const lines = buildLines(content)
  return (
    <div class="jsonl-line-preview" data-testid="jsonl-line-preview">
      {lines.length === 0 && (
        <div class="jsonl-line-empty">空文件</div>
      )}
      {lines.map((line) => (
        <div
          key={line.lineNumber}
          class={`jsonl-line-card${line.error ? ' jsonl-line-error' : ''}`}
          data-testid="jsonl-line-card"
        >
          <div class="jsonl-line-num">#{line.lineNumber}</div>
          <pre class="jsonl-line-content">
            {line.error ? (
              line.text
            ) : (
              <code
                class="hljs language-json"
                dangerouslySetInnerHTML={{ __html: highlightJson(line.text) }}
              />
            )}
          </pre>
        </div>
      ))}
    </div>
  )
}

export default JsonlLinePreview
