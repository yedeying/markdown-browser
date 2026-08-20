import { test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createDirRouter } from './dir.ts'
import type { FileNode } from '../../types.ts'

// .vmd-config.json 现在决定下一次启动的根目录（startupMode / singleMountAlias），
// 因此它不能再被当作普通内容文件：任何远端客户端只要能写它，就能把下次启动的
// 根目录指到预期范围之外。通用文件接口必须一律拒绝这些服务端托管文件，
// 只有专用的 /api/admin/* 写入口（父 app，走鉴权）可以改它。
// .vmd-shares.json 属于同一类：能写它就能伪造免登录分享令牌。

const CONFIG = '.vmd-config.json'
const HIJACK = JSON.stringify({
  startupMode: 'dir',
  singleMountAlias: 'escape',
  mounts: [{ alias: 'escape', name: 'escape', path: '/' }],
})

let base: string
let router: ReturnType<typeof createDirRouter>
let app: ReturnType<typeof createDirRouter>['app']

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'vmd-guard-'))
  mkdirSync(join(base, 'sub'))
  writeFileSync(join(base, 'README.md'), '# public\n')
  writeFileSync(join(base, 'evil.md'), HIJACK)
  writeFileSync(join(base, 'data.json'), '{"hijack-marker":"ordinary json"}')
  writeFileSync(join(base, CONFIG), JSON.stringify({
    startupMode: 'dir',
    singleMountAlias: 'notes',
    mounts: [{ alias: 'notes', name: '笔记', path: join(base, 'sub'), hijackMarker: 'hijack-marker' }],
  }, null, 2))
  writeFileSync(join(base, '.vmd-shares.json'), '{"shares":[]}')
  router = createDirRouter(base, join(base, '__dist__'), null)
  app = router.app
})

afterEach(() => {
  router.watcher.close()
  rmSync(base, { recursive: true, force: true })
})

function configOnDisk(): string {
  return readFileSync(join(base, CONFIG), 'utf-8')
}

function names(nodes: FileNode[]): string[] {
  return nodes.flatMap(n => [n.name, ...(n.children ? names(n.children) : [])])
}

// ============================================================
// 写入：直接改写
// ============================================================

test('POST /api/save refuses to write the reserved config file', async () => {
  const before = configOnDisk()
  const res = await app.request(`/api/save/${CONFIG}`, { method: 'POST', body: HIJACK })
  expect(res.status).toBe(403)
  expect(configOnDisk()).toBe(before)
})

test('POST /api/save refuses the reserved name in a subdirectory and the tmp sidecar', async () => {
  const nested = await app.request(`/api/save/sub/${CONFIG}`, { method: 'POST', body: HIJACK })
  expect(nested.status).toBe(403)
  expect(existsSync(join(base, 'sub', CONFIG))).toBe(false)

  // 原子写的中间文件：抢先写它可以让 MountManager 的 rename 落下攻击者的内容
  const tmp = await app.request(`/api/save/${CONFIG}.tmp`, { method: 'POST', body: HIJACK })
  expect(tmp.status).toBe(403)
  expect(existsSync(join(base, `${CONFIG}.tmp`))).toBe(false)
})

test('POST /api/save refuses the reserved share store', async () => {
  const res = await app.request('/api/save/.vmd-shares.json', { method: 'POST', body: '{"shares":[]}' })
  expect(res.status).toBe(403)
})

test('POST /api/save ignores case when matching the reserved name', async () => {
  const before = configOnDisk()
  const res = await app.request('/api/save/.VMD-Config.JSON', { method: 'POST', body: HIJACK })
  expect(res.status).toBe(403)
  // 大小写不敏感的文件系统上这次写入就是改写同一个文件
  expect(configOnDisk()).toBe(before)
})

test('POST /api/save still writes ordinary files including other json', async () => {
  expect((await app.request('/api/save/notes.md', { method: 'POST', body: '# ok\n' })).status).toBe(200)
  expect(readFileSync(join(base, 'notes.md'), 'utf-8')).toBe('# ok\n')
  expect((await app.request('/api/save/data.json', { method: 'POST', body: '{"a":1}' })).status).toBe(200)
})

// ============================================================
// 写入：绕道创建 / 改名 / 复制 / 删除
// ============================================================

test('POST /api/fs/touch refuses to create the reserved config file', async () => {
  const res = await app.request('/api/fs/touch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'sub/' + CONFIG }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, 'sub', CONFIG))).toBe(false)
})

test('POST /api/fs/rename refuses to turn an ordinary file into the config file', async () => {
  const res = await app.request('/api/fs/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'evil.md', newName: CONFIG }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, 'evil.md'))).toBe(true)
  expect(configOnDisk()).toContain('notes')
})

test('POST /api/fs/rename refuses to rename the config file away', async () => {
  const res = await app.request('/api/fs/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: CONFIG, newName: 'plain.md' }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, CONFIG))).toBe(true)
})

test('POST /api/fs/copy refuses to duplicate the config file into another directory', async () => {
  const res = await app.request('/api/fs/copy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [CONFIG], dest: 'sub' }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, 'sub', CONFIG))).toBe(false)
})

test('POST /api/fs/move refuses to relocate the config file', async () => {
  const res = await app.request('/api/fs/move', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [CONFIG], dest: 'sub' }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, CONFIG))).toBe(true)
  expect(existsSync(join(base, 'sub', CONFIG))).toBe(false)
})

test('DELETE /api/fs/delete refuses the config file', async () => {
  const res = await app.request('/api/fs/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [CONFIG] }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, CONFIG))).toBe(true)
})

test('a rejected batch leaves every path untouched, not just the reserved one', async () => {
  const res = await app.request('/api/fs/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['README.md', CONFIG] }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, 'README.md'))).toBe(true)
  expect(existsSync(join(base, CONFIG))).toBe(true)
})

test('ordinary file management still works', async () => {
  const renamed = await app.request('/api/fs/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'evil.md', newName: 'renamed.md' }),
  })
  expect(renamed.status).toBe(200)
  expect(existsSync(join(base, 'renamed.md'))).toBe(true)

  const deleted = await app.request('/api/fs/delete', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: ['renamed.md'] }),
  })
  expect(deleted.status).toBe(200)
  expect(existsSync(join(base, 'renamed.md'))).toBe(false)
})

// ============================================================
// 读取：挂载点路径本身就是敏感信息
// ============================================================

test('GET /api/file refuses the reserved config file even with showHidden=1', async () => {
  expect((await app.request(`/api/file/${CONFIG}`)).status).toBe(404)
  expect((await app.request(`/api/file/${CONFIG}?showHidden=1`)).status).toBe(404)
  expect((await app.request('/api/file/.vmd-shares.json?showHidden=1')).status).toBe(404)
})

test('GET /api/asset refuses the reserved config file even with showHidden=1', async () => {
  expect((await app.request(`/api/asset/${CONFIG}?showHidden=1`)).status).toBe(404)
})

test('the reserved config file is never listed, even with showHidden=1', async () => {
  const res = await app.request('/api/files?path=&depth=3&showHidden=1')
  const listed = names(await res.json() as FileNode[])
  expect(listed).toContain('README.md')
  expect(listed).not.toContain(CONFIG)
  expect(listed).not.toContain('.vmd-shares.json')
})

// ============================================================
// 分享链接：无需登录，因此这里的写入口最危险
// ============================================================

async function createFolderShare(): Promise<string> {
  const res = await app.request('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // 分享整个根目录：配置文件就在这个范围里
    body: JSON.stringify({ path: '.', type: 'folder', ttl: null }),
  })
  expect(res.status).toBe(200)
  return (await res.json() as { token: string }).token
}

test('an anonymous folder share cannot write the reserved config file', async () => {
  const token = await createFolderShare()
  const before = configOnDisk()
  const res = await app.request(`/share/${token}/api/save/${CONFIG}`, {
    method: 'POST',
    body: HIJACK,
  })
  expect(res.status).toBe(403)
  expect(configOnDisk()).toBe(before)
})

test('an anonymous folder share cannot create the reserved config file', async () => {
  const token = await createFolderShare()
  const res = await app.request(`/share/${token}/api/touch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: 'sub/' + CONFIG }),
  })
  expect(res.status).toBe(403)
  expect(existsSync(join(base, 'sub', CONFIG))).toBe(false)
})

test('an anonymous folder share cannot read the reserved config file', async () => {
  const token = await createFolderShare()
  expect((await app.request(`/share/${token}/api/file/${CONFIG}`)).status).toBe(404)
  expect((await app.request(`/share/${token}/api/asset/${CONFIG}`)).status).toBe(404)
  expect((await app.request(`/share/${token}/api/download/${CONFIG}`)).status).toBe(404)
  expect((await app.request(`/share/${token}/api/file/.vmd-shares.json`)).status).toBe(404)
})

test('share search never surfaces the reserved config file', async () => {
  const token = await createFolderShare()
  const res = await app.request(`/share/${token}/api/search?q=hijack-marker&type=content`)
  const paths = (await res.json() as Array<{ filePath: string }>).map(r => r.filePath)
  expect(paths).toContain('data.json')
  expect(paths).not.toContain(CONFIG)
})

test('ordinary share reads and writes still work', async () => {
  const token = await createFolderShare()
  const read = await app.request(`/share/${token}/api/file/README.md`)
  expect(read.status).toBe(200)
  expect(await read.text()).toContain('public')

  const write = await app.request(`/share/${token}/api/save/shared.md`, {
    method: 'POST',
    body: '# from share\n',
  })
  expect(write.status).toBe(200)
  expect(readFileSync(join(base, 'shared.md'), 'utf-8')).toBe('# from share\n')
})

test('search never surfaces the reserved config file by name or content', async () => {
  const byName = await app.request('/api/search?q=vmd-config&type=name&showHidden=1')
  expect(await byName.json()).toEqual([])

  const byContent = await app.request('/api/search?q=hijack-marker&type=content&showHidden=1')
  const paths = (await byContent.json() as Array<{ filePath: string }>).map(r => r.filePath)
  // 普通 json 仍然可搜到，被保留的配置文件不行
  expect(paths).toContain('data.json')
  expect(paths).not.toContain(CONFIG)
})
