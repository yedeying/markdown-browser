import { render } from 'preact'
import App from './App.js'
import './styles/index.css'
import './styles/markdown.css'

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

// 初始化主题
const savedTheme = (localStorage.getItem('vmd_theme') as 'dark' | 'light') || 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)
loadHljsTheme(savedTheme)

// 主题变更时同步 hljs
const observer = new MutationObserver(() => {
  const theme = document.documentElement.getAttribute('data-theme') as 'dark' | 'light'
  loadHljsTheme(theme)
})
observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

render(<App />, document.getElementById('app')!)
