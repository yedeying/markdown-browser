import type { FunctionalComponent } from 'preact'

interface Props {
  theme: 'dark' | 'light'
  onToggle: () => void
}

const ThemeToggle: FunctionalComponent<Props> = ({ theme, onToggle }) => {
  return (
    <button class="btn" onClick={onToggle} title={`切换到${theme === 'dark' ? '亮色' : '暗色'}主题`}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

export default ThemeToggle
