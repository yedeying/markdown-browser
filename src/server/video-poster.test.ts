import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { extractVideoPoster, clearVideoPosterCache } from './video-poster.ts'

const sampleMov = '/Users/yedeying/target/IMG_9942.MOV'

test('extractVideoPoster yields a non-empty webp for iPhone MOV via qlmanage', async () => {
  if (!existsSync(sampleMov) || process.platform !== 'darwin') {
    return
  }
  clearVideoPosterCache()
  const poster = await extractVideoPoster(sampleMov, { maxWidth: 320 })
  expect(poster).not.toBeNull()
  expect(poster!.data.byteLength).toBeGreaterThan(1000)
  expect(poster!.contentType).toBe('image/webp')
  expect(poster!.width).toBeGreaterThan(10)
  expect(poster!.height).toBeGreaterThan(10)
})
