import JsonlLinePreview from '../../components/JsonlLinePreview.js'
import type { VmdPlugin } from '../types.js'

/** 通用 JSONL 逐行卡片预览插件（优先级低于外部专用 JSONL 插件如 SillyTavern） */
export const jsonlPlugin: VmdPlugin<null> = {
  id: 'builtin.jsonl',
  name: 'JSONL 预览',
  priority: 30,
  target: 'file',
  icon: 'file-code',
  supportsSource: true,

  matchPath: ({ ext }) => ext === '.jsonl',

  modes: [{ id: 'jsonl', label: '预览' }],
  defaultMode: 'jsonl',

  renderMain({ content }) {
    return <JsonlLinePreview content={content} />
  },

  renderColumnPreview({ content }) {
    return (
      <div class="col-preview-jsonl" data-testid="col-preview-jsonl">
        <JsonlLinePreview content={content} />
      </div>
    )
  },
}
