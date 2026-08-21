import { describe, expect, test } from 'bun:test'
import { decodeTextBuffer } from './decodeText.ts'

describe('decodeTextBuffer', () => {
  test('decodes plain utf-8', () => {
    expect(decodeTextBuffer(Buffer.from('Dockerfile\nFROM alpine\n', 'utf-8'))).toBe(
      'Dockerfile\nFROM alpine\n',
    )
  })

  test('strips utf-8 BOM', () => {
    const body = Buffer.from('hello', 'utf-8')
    const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), body])
    expect(decodeTextBuffer(withBom)).toBe('hello')
  })

  test('decodes utf-16le with BOM', () => {
    const withBom = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from('hi', 'utf-16le'),
    ])
    expect(decodeTextBuffer(withBom)).toBe('hi')
  })

  test('falls back when bytes are not valid utf-8', () => {
    // invalid utf-8 lead byte sequence — should not throw
    const buf = Buffer.from([0xc3, 0x28, 0x61])
    const text = decodeTextBuffer(buf)
    expect(typeof text).toBe('string')
    expect(text.length).toBeGreaterThan(0)
  })
})
