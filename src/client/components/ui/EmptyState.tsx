import type { FunctionalComponent, ComponentChildren } from 'preact'

interface Props {
  icon?: ComponentChildren
  title: string
  description?: string
  action?: ComponentChildren
}

const EmptyState: FunctionalComponent<Props> = ({ icon, title, description, action }) => {
  return (
    <div class="empty-state">
      {icon && <div class="empty-state-icon">{icon}</div>}
      <div class="empty-state-text">{title}</div>
      {description && <div class="empty-state-description">{description}</div>}
      {action && <div class="empty-state-action">{action}</div>}
    </div>
  )
}

export default EmptyState
