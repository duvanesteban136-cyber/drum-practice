import { describe, it, expect } from 'vitest'
import { mergeEntity, mergeState } from './merge.js'

describe('mergeEntity', () => {
  it('newer updatedAt wins', () => {
    const a = { id: 'x', name: 'a', updatedAt: 1 }
    const b = { id: 'x', name: 'b', updatedAt: 2 }
    expect(mergeEntity(a, b)).toBe(b)
    expect(mergeEntity(b, a)).toBe(b)
  })
  it('a newer tombstone wins over an edit', () => {
    const edit = { id: 'x', updatedAt: 1, deletedAt: null }
    const tomb = { id: 'x', updatedAt: 2, deletedAt: 2 }
    expect(mergeEntity(edit, tomb).deletedAt).toBe(2)
  })
  it('a newer edit revives a tombstone', () => {
    const tomb = { id: 'x', updatedAt: 1, deletedAt: 1 }
    const edit = { id: 'x', updatedAt: 2, deletedAt: null }
    expect(mergeEntity(tomb, edit).deletedAt).toBeNull()
  })
  it('equal timestamps resolve identically regardless of order', () => {
    const a = { id: 'x', name: 'a', updatedAt: 5 }
    const b = { id: 'x', name: 'b', updatedAt: 5 }
    expect(mergeEntity(a, b)).toEqual(mergeEntity(b, a))
  })
  it('handles a missing side', () => {
    const a = { id: 'x', updatedAt: 1 }
    expect(mergeEntity(a, undefined)).toBe(a)
    expect(mergeEntity(undefined, a)).toBe(a)
  })
})

describe('mergeState', () => {
  it('merges per kind and id', () => {
    const local = { exercise: { a: { id: 'a', updatedAt: 1 }, b: { id: 'b', updatedAt: 5 } } }
    const remote = { exercise: { a: { id: 'a', updatedAt: 2 }, b: { id: 'b', updatedAt: 3 }, c: { id: 'c', updatedAt: 1 } }, song: { s: { id: 's', updatedAt: 1 } } }
    const m = mergeState(local, remote)
    expect(m.exercise.a.updatedAt).toBe(2)
    expect(m.exercise.b.updatedAt).toBe(5)
    expect(m.exercise.c).toBeDefined()
    expect(m.song.s).toBeDefined()
    expect(m.fill).toEqual({})
  })
})
