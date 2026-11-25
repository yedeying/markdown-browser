import PdfViewer from '../../components/PdfViewer.js'
import { getFileType } from '../../utils/fileType.js'
import type { VmdPlugin } from '../types.js'

export const pdfPlugin: VmdPlugin<null> = {
  id: 'builtin.pdf',
  name: 'PDF 预览',
  priority: 40,
  target: 'file',
  icon: 'file-text',
  requiresContent: false,

  matchPath: ({ name }) => getFileType(name) === 'pdf',

  renderMain({ filePath }) {
    return <PdfViewer filePath={filePath} />
  },

  renderColumnPreview({ node }) {
    return <PdfViewer filePath={node.path} compact />
  },
}
