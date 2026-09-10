/**
 * SPA index.html runtime injection — always per-response, never write to dist.
 * Writing __VMD_DIR_NAME__ into shared dist/index.html caused cross-talk when
 * multiple vmd processes served different directories from the same build.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const RUNTIME_SCRIPT_RE = /<script>window\.__VMD_[\s\S]*?<\/script>\s*/g

export function stripVmdRuntimeScripts(html: string): string {
  return html.replace(RUNTIME_SCRIPT_RE, '')
}

export function injectRuntimeScript(html: string, scriptBody: string): string {
  const clean = stripVmdRuntimeScripts(html)
  const script = `<script>${scriptBody}</script>`
  if (clean.includes('</head>')) {
    return clean.replace('</head>', `${script}\n</head>`)
  }
  return `${script}\n${clean}`
}

export function readDistIndexHtml(distPath: string): string {
  return readFileSync(join(distPath, 'index.html'), 'utf-8')
}

/** dir / single 模式：每次响应注入 mode + 目录显示名 */
export function renderDirIndexHtml(
  distPath: string,
  opts: { mode: 'dir' | 'single'; dirName: string },
): string {
  const html = readDistIndexHtml(distPath)
  const body =
    `window.__VMD_MODE__=${JSON.stringify(opts.mode)};` +
    `window.__VMD_DIR_NAME__=${JSON.stringify(opts.dirName)};`
  return injectRuntimeScript(html, body)
}
