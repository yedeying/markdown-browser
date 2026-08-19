import type { FunctionalComponent } from 'preact'

interface Props {
  variant: 'folder' | 'file'
}

const FOLDER_ROW_WIDTHS = [0.7, 0.5, 0.85, 0.6, 0.75, 0.45, 0.9, 0.55]
const FILE_LINE_WIDTHS = [0.6, 1, 0.75, 0.9, 0.5, 0.8, 0.65, 0.95, 0.7, 0.55, 0.85, 0.4]

/**
 * Loading placeholder for the sidebar file tree (`variant="folder"`) or the
 * file content area (`variant="file"`). Reuses the existing
 * `.tree-skeleton` / `.file-loading` markup + CSS.
 */
const Skeleton: FunctionalComponent<Props> = ({ variant }) => {
  if (variant === 'folder') {
    return (
      <div class="tree-skeleton" data-testid="folder-skeleton">
        {FOLDER_ROW_WIDTHS.map((w, i) => (
          <div key={i} class="tree-skeleton-row" style={{ paddingLeft: `${8 + (i % 3) * 12}px` }}>
            <div class="tree-skeleton-icon" />
            <div class="tree-skeleton-line" style={{ width: `${w * 100}%` }} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div class="file-loading">
      <div class="file-loading-bars">
        {FILE_LINE_WIDTHS.map((w, i) => (
          <div key={i} class="file-loading-line" style={{ width: `${w * 100}%`, animationDelay: `${i * 0.04}s` }} />
        ))}
      </div>
    </div>
  )
}

export default Skeleton
