import type { FunctionalComponent } from 'preact'
import Icon from './ui/Icon.js'

interface Props {
  theme: 'dark' | 'light'
  onToggle: () => void
}

const ThemeToggle: FunctionalComponent<Props> = ({ theme, onToggle }) => {
  const label = `切换到${theme === 'dark' ? '亮色' : '暗色'}主题`
  return (
    <button class="header-icon-btn" onClick={onToggle} title={label} aria-label={label}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} aria-hidden="true" />
    </button>
  )
}

export default ThemeToggle
