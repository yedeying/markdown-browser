import { expect, test } from 'bun:test'
import { createAsyncPool } from './asyncPool.ts'

test('createAsyncPool limits concurrency and drains the queue', async () => {
  const pool = createAsyncPool(2)
  let running = 0
  let peak = 0
  const tasks = Array.from({ length: 5 }, (_, i) =>
    pool.run(async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((r) => setTimeout(r, 5))
      running--
      return i
    }),
  )
  const results = await Promise.all(tasks)
  expect(results).toEqual([0, 1, 2, 3, 4])
  expect(peak).toBe(2)
  expect(pool.active).toBe(0)
  expect(pool.waiting).toBe(0)
})

test('createAsyncPool priority jumps the queue', async () => {
  const pool = createAsyncPool(1)
  const order: string[] = []
  const first = pool.run(async () => {
    order.push('first-start')
    await new Promise((r) => setTimeout(r, 10))
    order.push('first-end')
  })
  await new Promise((r) => setTimeout(r, 0))
  const low = pool.run(async () => {
    order.push('low')
  }, false)
  const high = pool.run(async () => {
    order.push('high')
  }, true)
  await Promise.all([first, low, high])
  expect(order).toEqual(['first-start', 'first-end', 'high', 'low'])
})

test('createAsyncPool pause blocks new work until resume', async () => {
  const pool = createAsyncPool(1)
  const order: string[] = []
  pool.pause()
  const blocked = pool.run(async () => {
    order.push('blocked')
  })
  await new Promise((r) => setTimeout(r, 15))
  expect(order).toEqual([])
  expect(pool.paused).toBe(true)
  pool.resume()
  await blocked
  expect(order).toEqual(['blocked'])
  expect(pool.paused).toBe(false)
})

test('createAsyncPool pause does not hand slots to waiters on release', async () => {
  const pool = createAsyncPool(1)
  let releaseFirst!: () => void
  const first = pool.run(async () => {
    await new Promise<void>((resolve) => { releaseFirst = resolve })
  })
  const second = pool.run(async () => 'second')
  await new Promise((r) => setTimeout(r, 0))
  pool.pause()
  releaseFirst()
  await first
  await new Promise((r) => setTimeout(r, 15))
  expect(pool.active).toBe(0)
  expect(pool.waiting).toBe(1)
  pool.resume()
  expect(await second).toBe('second')
})

test('createAsyncPool setMax wakes extra waiters', async () => {
  const pool = createAsyncPool(1)
  const started: number[] = []
  let releaseFirst!: () => void
  const tasks = [0, 1, 2].map((i) =>
    pool.run(async () => {
      started.push(i)
      if (i === 0) await new Promise<void>((resolve) => { releaseFirst = resolve })
    }),
  )
  await new Promise((r) => setTimeout(r, 0))
  expect(started).toEqual([0])
  pool.setMax(3)
  await new Promise((r) => setTimeout(r, 0))
  expect(started).toEqual([0, 1, 2])
  releaseFirst()
  await Promise.all(tasks)
})
