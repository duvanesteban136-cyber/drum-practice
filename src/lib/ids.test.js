import { describe, it, expect } from 'vitest'
import { uid } from './ids.js'

describe('uid', () => {
  it('returns a string of length >= 16', () => {
    const id = uid()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThanOrEqual(16)
  })
  it('produces 1000 distinct values', () => {
    const set = new Set(Array.from({ length: 1000 }, () => uid()))
    expect(set.size).toBe(1000)
  })
})
