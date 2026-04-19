/**
 * Unit tests for shepherd/github/client.mts — pure helper logic.
 * Uses vi.mock for execFile — lives in client.mock.test.mts.
 * This file covers things that don't need mocking (e.g. argument builders).
 */

import { describe, it, expect } from 'vitest'

// Test that the module exports exist (smoke test — real calls require gh CLI).
describe('client module', () => {
  it('exports the expected functions', async () => {
    const module = await import('./client.mts')
    expect(typeof module.graphql).toBe('function')
    expect(typeof module.rest).toBe('function')
    expect(typeof module.getRepoInfo).toBe('function')
    expect(typeof module.getCurrentPrNumber).toBe('function')
    expect(typeof module.getPrHeadSha).toBe('function')
    expect(typeof module.restMutate).toBe('function')
    expect(typeof module.graphqlWithRateLimit).toBe('function')
  })
})
