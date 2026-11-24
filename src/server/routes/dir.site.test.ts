import { test, expect, beforeAll, afterAll } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter } from './dir.ts'

let base: string
let siblingBase: string
let app: ReturnType<typeof createDirRouter>['app']
let watcher: ReturnType<typeof createDirRouter>['watcher']

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'vmd-site-'))
  // 同前缀兄弟目录，用于校验路径边界不被 startsWith(realBase) 绕过
  siblingBase = `${base}-sibling`
  mkdirSync(siblingBase, { recursive: true })
  writeFileSync(join(siblingBase, 'leak.html'), 'SIBLING-SECRET')

  const site = join(base, 'sites', 'demo')
  mkdirSync(join(site, 'css'), { recursive: true })
  mkdirSync(join(site, 'js'), { recursive: true })
  mkdirSync(join(site, 'data'), { recursive: true })
  writeFileSync(
    join(site, 'index.html'),
    '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="css/app.css"><script src="js/app.js"></script><h1>站点标题</h1>',
  )
  writeFileSync(join(site, 'css', 'app.css'), 'body{color:#123456}')
  writeFileSync(join(site, 'js', 'app.js'), 'console.log("hi")')
  writeFileSync(join(site, 'data', 'index.json'), '{"a":1}')
  // 无 index.html 的普通目录
  mkdirSync(join(base, 'plain'), { recursive: true })
  writeFileSync(join(base, 'plain', 'note.md'), '# hi')
  // 不支持的扩展名
  writeFileSync(join(site, 'data.bin'), Buffer.from([0, 1, 2]))
  // 站点外的敏感文件（用于越界检查）
  writeFileSync(join(base, 'secret.txt'), 'TOP-SECRET')

  const router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
  watcher = router.watcher
})

afterAll(() => {
  watcher.close()
  rmSync(base, { recursive: true, force: true })
  rmSync(siblingBase, { recursive: true, force: true })
})

const req = (path: string) => app.request(path)

test('/site 返回 index.html，Content-Type 为 text/html 且不缓存', async () => {
  const res = await req('/site/sites/demo/index.html')
  expect(res.status).toBe(200)
  expect(res.headers.get('content-type')).toContain('text/html')
  expect(res.headers.get('cache-control')).toBe('no-cache')
  expect(await res.text()).toContain('站点标题')
})

test('/site 目录索引：末尾带斜杠或不带斜杠都落到 index.html', async () => {
  const withSlash = await req('/site/sites/demo/')
  expect(withSlash.status).toBe(200)
  expect(await withSlash.text()).toContain('站点标题')

  const noSlash = await req('/site/sites/demo')
  expect(noSlash.status).toBe(200)
  expect(await noSlash.text()).toContain('站点标题')
})

test('/site 提供相对资源：css / js / json 的 MIME 正确', async () => {
  const css = await req('/site/sites/demo/css/app.css')
  expect(css.status).toBe(200)
  expect(css.headers.get('content-type')).toContain('text/css')
  expect(css.headers.get('cache-control')).toContain('max-age')
  expect(await css.text()).toContain('#123456')

  const js = await req('/site/sites/demo/js/app.js')
  expect(js.status).toBe(200)
  expect(js.headers.get('content-type')).toContain('text/javascript')

  const json = await req('/site/sites/demo/data/index.json')
  expect(json.status).toBe(200)
  expect(json.headers.get('content-type')).toContain('application/json')
})

test('/site 允许同源 iframe 嵌入（不发 DENY）', async () => {
  const res = await req('/site/sites/demo/index.html')
  expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
})

test('/site 目录不存在或没有 index.html 时 404', async () => {
  expect((await req('/site/sites/missing/index.html')).status).toBe(404)
  expect((await req('/site/plain/')).status).toBe(404)
})

test('/site 拒绝编码后的路径穿越与同前缀兄弟目录越界', async () => {
  const siblingName = siblingBase.split('/').pop()!
  const cases = [
    '/site/%2e%2e%2f%2e%2e%2fsecret.txt',
    '/site/sites/%2e%2e%2f%2e%2e%2fsecret.txt',
    '/site/..%2fsecret.txt',
    `/site/%2e%2e%2f${encodeURIComponent(siblingName)}%2fleak.html`,
  ]
  for (const p of cases) {
    const res = await req(p)
    expect(res.status).not.toBe(200)
    const body = await res.text()
    expect(body).not.toContain('TOP-SECRET')
    expect(body).not.toContain('SIBLING-SECRET')
  }
})

test('/site 对非法百分号编码返回 400 而非 500', async () => {
  const res = await req('/site/%E0%A4%A/index.html')
  expect(res.status).toBe(400)
})

test('/site 拒绝不在白名单内的扩展名', async () => {
  const res = await req('/site/sites/demo/data.bin')
  expect(res.status).toBe(415)
})
