import { useState, useEffect } from 'preact/hooks'
import { usePref } from './usePref.js'
import { applyAppearancePrefs, resolveTheme } from '../utils/appearance.js'
import type { ThemePref } from '../utils/prefs.js'

export function useTheme() {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const [selectedTheme, setSelectedTheme] = usePref('theme')
  const [prefersDark, setPrefersDark] = useState(mediaQuery.matches)
  const resolvedTheme = resolveTheme(selectedTheme, prefersDark)

  useEffect(() => {
    if (selectedTheme !== 'system') return
    setPrefersDark(mediaQuery.matches)
    const handleChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [selectedTheme])

  useEffect(() => {
    applyAppearancePrefs(document.documentElement, prefersDark)
  }, [selectedTheme, prefersDark])

  const setTheme = (theme: ThemePref) => setSelectedTheme(theme)
  const toggle = () => setSelectedTheme(resolvedTheme === 'dark' ? 'light' : 'dark')

  return {
    theme: resolvedTheme,
    selectedTheme,
    resolvedTheme,
    setTheme,
    toggle,
  }
}
