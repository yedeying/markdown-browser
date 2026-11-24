import { test, expect, beforeAll, afterAll } from 'bun:test'
import { Hono } from 'hono'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listExternalPlugins, registerPluginRoutes } from './plugins.ts'

let dir: string
let app: Hono

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'vmd-plugins-'))
  const p1 = join(dir, 'csv-viewer')
  mkdirSync(p1, { recursive: true })
  writeFileSync(join(p1, 'manifest.json'), JSON.stringify({
    id: 'ext.csv-viewer',
    name: 'CSV Viewer',
    version: '1.0.0',
    entry: 'index.js',
    styles: ['style.css'],
  }))
  writeFileSync(join(p1, 'index.js'), 'export default function() { return { id: "ext.csv-viewer" } }')
  writeFileSync(join(p1, 'style.css'), '.csv-table { width: 100%; }')
  writeFileSync(join(p1, 'secret.bin'), Buffer.from([1, 2, 3]))

  // 损坏的 manifest 应被静默跳过
  const bad = join(dir, 'broken')
  mkdirSync(bad, { recursive: true })
  writeFileSync(join(bad, 'manifest.json'), '{not-json')

  writeFileSync(join(dir, 'outside.js'), 'SECRET')

  app = new Hono()
  registerPluginRoutes(app, dir)
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

test('listExternalPlugins returns valid plugins and skips malformed ones', () => {
  const list = listExternalPlugins(dir)
  expect(list.length).toBe(1)
  expect(list[0]).toEqual({
    id: 'ext.csv-viewer',
    name: 'CSV Viewer',
    version: '1.0.0',
    dir: 'csv-viewer',
    entryUrl: '/plugins/csv-viewer/index.js',
    styleUrls: ['/plugins/csv-viewer/style.css'],
  })
  expect(listExternalPlugins(undefined)).toEqual([])
  expect(listExternalPlugins(join(dir, 'nonexistent'))).toEqual([])
})

test('GET /api/plugins and /plugins/:dir/* serve assets with correct MIME', async () => {
  const listRes = await app.request('/api/plugins')
  expect(listRes.status).toBe(200)
  const json = await listRes.json() as { plugins: unknown[] }
  expect(json.plugins.length).toBe(1)

  const jsRes = await app.request('/plugins/csv-viewer/index.js')
  expect(jsRes.status).toBe(200)
  expect(jsRes.headers.get('content-type')).toContain('text/javascript')
  expect(await jsRes.text()).toContain('ext.csv-viewer')

  const cssRes = await app.request('/plugins/csv-viewer/style.css')
  expect(cssRes.status).toBe(200)
  expect(cssRes.headers.get('content-type')).toContain('text/css')
})

test('/plugins/:dir/* rejects path traversal and unsupported file types', async () => {
  const trav = await app.request('/plugins/csv-viewer/%2e%2e/outside.js')
  expect(trav.status).toBe(403)
  expect(await trav.text()).not.toContain('SECRET')

  const badExt = await app.request('/plugins/csv-viewer/secret.bin')
  expect(badExt.status).toBe(415)
})
