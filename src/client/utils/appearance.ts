import {
  getPref,
  type AccentPref,
  type ThemePref,
} from './prefs.js'

export type ResolvedTheme = Exclude<ThemePref, 'system'>

export interface AccentTokens {
  accent: string
  accentActive: string
  onAccent: '#ffffff' | '#1f2328'
}

const ACCENT_PRESETS: Record<Exclude<AccentPref, 'custom'>, Record<ResolvedTheme, string>> = {
  orange: { dark: '#ff7b47', light: '#f54e00' },
  blue: { dark: '#58a6ff', light: '#0969da' },
  cyan: { dark: '#39c5cf', light: '#0e7490' },
  green: { dark: '#3fb950', light: '#1a7f37' },
  purple: { dark: '#a371f7', light: '#8250df' },
  rose: { dark: '#f778ba', light: '#bf3989' },
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

export function resolveTheme(selectedTheme: ThemePref, prefersDark: boolean): ResolvedTheme {
  return selectedTheme === 'system'
    ? (prefersDark ? 'dark' : 'light')
    : selectedTheme
}

function darken(color: string, amount = 0.15): string {
  const channels = [1, 3, 5].map((index) =>
    Math.round(Number.parseInt(color.slice(index, index + 2), 16) * (1 - amount)),
  )
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

function relativeLuminance(color: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = Number.parseInt(color.slice(index, index + 2), 16) / 255
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrastRatio(first: string, second: string): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second))
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

export function getAccentTokens(
  accentPref: AccentPref,
  theme: ResolvedTheme,
  customColor = '',
): AccentTokens {
  let accent: string
  if (accentPref === 'custom' && HEX_COLOR.test(customColor)) {
    const normalized = customColor.toLowerCase()
    accent = theme === 'light' ? darken(normalized) : normalized
  } else {
    const preset = accentPref === 'custom' ? 'orange' : accentPref
    accent = ACCENT_PRESETS[preset][theme]
  }

  const white = '#ffffff'
  const dark = '#1f2328'

  return {
    accent,
    accentActive: darken(accent),
    onAccent: contrastRatio(accent, dark) >= contrastRatio(accent, white) ? dark : white,
  }
}

export function applyAppearancePrefs(
  root: HTMLElement = document.documentElement,
  prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches,
): { selectedTheme: ThemePref; resolvedTheme: ResolvedTheme } {
  const selectedTheme = getPref('theme')
  const resolvedTheme = resolveTheme(selectedTheme, prefersDark)
  const accentTokens = getAccentTokens(
    getPref('accent'),
    resolvedTheme,
    getPref('accentCustom'),
  )

  root.setAttribute('data-theme', resolvedTheme)
  root.style.setProperty('--accent', accentTokens.accent)
  root.style.setProperty('--accent-active', accentTokens.accentActive)
  root.style.setProperty('--on-accent', accentTokens.onAccent)
  root.style.setProperty(
    '--reading-width',
    getPref('readingWidth') === 'full' ? 'none' : `${getPref('readingWidth')}px`,
  )
  root.style.setProperty('--reading-font-size', `${getPref('readingFontSize')}px`)
  root.style.setProperty('--reading-line-height', String(getPref('readingLineHeight')))
  root.style.setProperty('--editor-font-size', `${getPref('editorFontSize')}px`)

  return { selectedTheme, resolvedTheme }
}
