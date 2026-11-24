import EmptyState from '../../components/ui/EmptyState.js'
import Icon from '../../components/ui/Icon.js'
import MarkdownPreview from '../../components/MarkdownPreview.js'
import TableOfContents from '../../components/TableOfContents.js'
import type { VmdPlugin } from '../types.js'

export const markdownPlugin: VmdPlugin<null> = {
  id: 'builtin.markdown',
  name: 'Markdown',
  priority: 50,
  target: 'file',
  icon: 'file-text',
  supportsSplitEdit: true,

  matchPath: ({ ext }) => ext === '.md' || ext === '.markdown',

  renderMain({ filePath, content, previewContentRef, onSave, onCheckboxToggle }) {
    if (content === '') {
      return (
        <EmptyState
          icon={<Icon name="file-text" size={40} aria-hidden="true" />}
          title="空文件"
          description="点击「编辑」开始写作"
        />
      )
    }
    return (
      <MarkdownPreview
        markdown={content}
        contentRef={previewContentRef}
        filePath={filePath}
        onCheckboxToggle={onSave ? onCheckboxToggle : undefined}
      />
    )
  },

  renderColumnPreview({ node, content }) {
    return (
      <div class="col-preview-md">
        <MarkdownPreview markdown={content} filePath={node.path} />
      </div>
    )
  },

  renderToc({ filePath, previewContentRef }) {
    return <TableOfContents contentRef={previewContentRef} filePath={filePath} />
  },
}
