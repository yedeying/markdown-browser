import { render } from 'preact'
import App from './App.js'
import { applyAppearancePrefs } from './utils/appearance.js'
import { getPref, subscribePref, type PrefKey } from './utils/prefs.js'
import './styles/index.css'
import './styles/markdown.css'
import './styles/print.css'

// highlight.js 主题（根据 data-theme 切换）
function loadHljsTheme(theme: 'dark' | 'light') {
  let link = document.getElementById('hljs-theme') as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = 'hljs-theme'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }
  link.href = theme === 'dark'
    ? 'https://unpkg.com/@highlightjs/cdn-assets@11.10.0/styles/github-dark.min.css'
    : 'https://unpkg.com/@highlightjs/cdn-assets@11.10.0/styles/github.min.css'
}

const colorScheme = window.matchMedia('(prefers-color-scheme: dark)')
const appearanceKeys: PrefKey[] = [
  'theme',
  'accent',
  'accentCustom',
  'readingWidth',
  'readingFontSize',
  'readingLineHeight',
  'editorFontSize',
]
const refreshAppearance = () =>
  applyAppearancePrefs(document.documentElement, colorScheme.matches)

// 在 Preact 首次渲染前应用所有外观偏好，避免主题和排版闪烁。
const initialAppearance = refreshAppearance()
loadHljsTheme(initialAppearance.resolvedTheme)

for (const key of appearanceKeys) {
  subscribePref(key, refreshAppearance)
}

colorScheme.addEventListener('change', () => {
  if (getPref('theme') === 'system') refreshAppearance()
})

// 主题变更时同步 hljs
const observer = new MutationObserver(() => {
  const theme = document.documentElement.getAttribute('data-theme') as 'dark' | 'light'
  loadHljsTheme(theme)
})
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

render(<App />, document.getElementById('app')!)
