import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { randomBytes } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { cacheGet, cacheSet, type CacheKey } from './file-cache.mts'

// Use a unique test prefix so runs never collide.
function testKey(shape = 'test'): CacheKey {
  return {
    owner: 'test-owner',
    repo: 'test-repo',
    pr: Math.floor(Math.random() * 900000) + 100000,
    shape,
  }
}

let testCacheDir: string

beforeEach(() => {
  // Point cache at a temp subdir isolated per test run.
  testCacheDir = `${process.env['TMPDIR'] ?? '/tmp'}/shepherd-test-${randomBytes(4).toString('hex')}`
  process.env['PR_SHEPHERD_CACHE_DIR'] = testCacheDir
})

afterEach(async () => {
  delete process.env['PR_SHEPHERD_CACHE_DIR']
  await rm(testCacheDir, { recursive: true, force: true })
})

describe('cacheGet / cacheSet', () => {
  it('returns null on a cache miss', async () => {
    const result = await cacheGet<string>(testKey())
    expect(result).toBeNull()
  })

  it('returns the stored value on a cache hit', async () => {
    const key = testKey()
    const value = { foo: 'bar', n: 42 }
    await cacheSet(key, value)
    const result = await cacheGet<typeof value>(key)
    expect(result).toEqual(value)
  })

  it('returns null when the cache entry is expired', async () => {
    const key = testKey()
    await cacheSet(key, { data: 'stale' })
    // ttlSeconds=0 means the entry is immediately expired.
    const result = await cacheGet(key, { ttlSeconds: 0 })
    expect(result).toBeNull()
  })

  it('returns the value within TTL', async () => {
    const key = testKey()
    await cacheSet(key, 'fresh')
    const result = await cacheGet<string>(key, { ttlSeconds: 60 })
    expect(result).toBe('fresh')
  })

  it('returns null when disabled', async () => {
    const key = testKey()
    await cacheSet(key, 'should-not-be-returned', { disabled: false })
    const result = await cacheGet(key, { disabled: true })
    expect(result).toBeNull()
  })

  it('does not write when disabled', async () => {
    const key = testKey()
    await cacheSet(key, 'ignored', { disabled: true })
    const result = await cacheGet(key)
    expect(result).toBeNull()
  })

  it('overwrites an existing cache entry', async () => {
    const key = testKey()
    await cacheSet(key, 'first')
    await cacheSet(key, 'second')
    const result = await cacheGet<string>(key)
    expect(result).toBe('second')
  })

  it('handles different shapes as separate entries', async () => {
    const pr = Math.floor(Math.random() * 900000) + 100000
    const keyA: CacheKey = { owner: 'o', repo: 'r', pr, shape: 'shape-a' }
    const keyB: CacheKey = { owner: 'o', repo: 'r', pr, shape: 'shape-b' }

    await cacheSet(keyA, 'valueA')
    await cacheSet(keyB, 'valueB')

    expect(await cacheGet<string>(keyA)).toBe('valueA')
    expect(await cacheGet<string>(keyB)).toBe('valueB')
  })
})
