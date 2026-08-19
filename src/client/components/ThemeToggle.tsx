import type { FunctionalComponent } from 'preact'
import Icon from './ui/Icon.js'

interface Props {
  theme: 'dark' | 'light'
  onToggle: () => void
}

const ThemeToggle: FunctionalComponent<Props> = ({ theme, onToggle }) => {
  return (
    <button class="btn" onClick={onToggle} title={`切换到${theme === 'dark' ? '亮色' : '暗色'}主题`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} aria-hidden="true" />
    </button>
  )
}

export default ThemeToggle
