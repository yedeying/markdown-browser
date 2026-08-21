import { test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseStJsonl } from './stJsonl.ts'

const chatFixture = readFileSync(
  join(import.meta.dir, '../../../tests/fixtures/docs/chat.jsonl'),
  'utf8',
)

test('chat.jsonl fixture parses as ST with a non-null header and at least one message', () => {
  const result = parseStJsonl(chatFixture)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.header).not.toBeNull()
  expect(result.messages.length).toBeGreaterThanOrEqual(1)
})

test('characterName/userName come from the first non-user/user message respectively', () => {
  const result = parseStJsonl(chatFixture)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const firstNonUser = result.messages.find((m) => !m.is_user)
  const firstUser = result.messages.find((m) => m.is_user)
  expect(result.characterName).toBe(firstNonUser?.name ?? null)
  expect(result.userName).toBe(firstUser?.name ?? null)
})

test('extra.reasoning and extra.model survive parsing untouched', () => {
  const result = parseStJsonl(chatFixture)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  const withReasoning = result.messages.find(
    (m) => typeof m.extra.reasoning === 'string' && (m.extra.reasoning as string).length > 0,
  )
  expect(withReasoning).toBeDefined()
  expect(typeof withReasoning!.extra.model).toBe('string')
})

test('header is excluded from the messages list', () => {
  const result = parseStJsonl(chatFixture)
  expect(result.ok).toBe(true)
  if (!result.ok) return
  for (const m of result.messages) {
    expect('user_name' in m).toBe(false)
    expect('chat_metadata' in m).toBe(false)
  }
})

test('missing mes on a message line fails the whole file', () => {
  const header = JSON.stringify({ user_name: 'u', character_name: 'c', chat_metadata: {} })
  const goodMsg = JSON.stringify({ name: 'a', is_user: true, mes: 'hi', send_date: 'd', extra: {} })
  const badMsg = JSON.stringify({ name: 'b', is_user: false, send_date: 'd', extra: {} })
  const result = parseStJsonl([header, goodMsg, badMsg].join('\n'))
  expect(result.ok).toBe(false)
})

test('missing is_user, wrong-typed send_date, or non-object extra each fail the file', () => {
  const base = { name: 'a', is_user: true, mes: 'hi', send_date: 'd', extra: {} }
  expect(parseStJsonl(JSON.stringify({ ...base, is_user: undefined })).ok).toBe(false)
  expect(parseStJsonl(JSON.stringify({ ...base, send_date: 12345 })).ok).toBe(false)
  expect(parseStJsonl(JSON.stringify({ ...base, extra: [] })).ok).toBe(false)
  expect(parseStJsonl(JSON.stringify({ ...base, extra: 'nope' })).ok).toBe(false)
})

test('pure array-of-{a:1} lines are not ST (no required fields at all)', () => {
  const text = ['{"a":1}', '{"a":2}', '{"a":3}'].join('\n')
  const result = parseStJsonl(text)
  expect(result.ok).toBe(false)
})

test('any invalid JSON line fails the whole file, even amid otherwise-valid ST lines', () => {
  const header = JSON.stringify({ user_name: 'u', character_name: 'c', chat_metadata: {} })
  const goodMsg = JSON.stringify({ name: 'a', is_user: true, mes: 'hi', send_date: 'd', extra: {} })
  const result = parseStJsonl([header, goodMsg, 'not json at all'].join('\n'))
  expect(result.ok).toBe(false)
})

test('a non-object JSON line (array/number/string) fails the whole file', () => {
  const goodMsg = JSON.stringify({ name: 'a', is_user: true, mes: 'hi', send_date: 'd', extra: {} })
  expect(parseStJsonl([goodMsg, '[1,2,3]'].join('\n')).ok).toBe(false)
  expect(parseStJsonl([goodMsg, '42'].join('\n')).ok).toBe(false)
  expect(parseStJsonl([goodMsg, '"just a string"'].join('\n')).ok).toBe(false)
})

test('empty input, or input with only blank lines, is not ST', () => {
  expect(parseStJsonl('').ok).toBe(false)
  expect(parseStJsonl('\n\n   \n\t\n').ok).toBe(false)
})

test('no header: every line must be a valid message; at least one message required', () => {
  const msg1 = JSON.stringify({ name: 'a', is_user: true, mes: 'hi', send_date: 'd', extra: {} })
  const msg2 = JSON.stringify({ name: 'b', is_user: false, mes: 'yo', send_date: 'd2', extra: {} })
  const result = parseStJsonl([msg1, msg2].join('\n'))
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.header).toBeNull()
  expect(result.messages).toHaveLength(2)
})

test('a header-shaped first line with zero following messages is not ST', () => {
  const header = JSON.stringify({ user_name: 'u', character_name: 'c', chat_metadata: {} })
  expect(parseStJsonl(header).ok).toBe(false)
})

test('blank lines between records are ignored', () => {
  const msg1 = JSON.stringify({ name: 'a', is_user: true, mes: 'hi', send_date: 'd', extra: {} })
  const msg2 = JSON.stringify({ name: 'b', is_user: false, mes: 'yo', send_date: 'd2', extra: {} })
  const result = parseStJsonl(['', msg1, '   ', msg2, ''].join('\n'))
  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.messages).toHaveLength(2)
})

test('optional fields (title, swipes, force_avatar, ...) never cause failure', () => {
  const msg = JSON.stringify({
    name: 'a',
    is_user: true,
    mes: 'hi',
    send_date: 'd',
    extra: {},
    title: 't',
    swipes: ['x', 'y'],
    swipe_id: 1,
    is_system: false,
    force_avatar: '/thumb.png',
    variables: [{}],
  })
  expect(parseStJsonl(msg).ok).toBe(true)
})
