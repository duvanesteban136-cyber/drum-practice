// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createStore } from './store.js'
import { newExercise, newLog } from './schema.js'

const KEY = 'dp-v4'
beforeEach(() => localStorage.clear())

describe('store', () => {
  it('persists across reload', () => {
    const s = createStore({ storage: localStorage })
    const e = newExercise({ name: 'Paradiddle' })
    s.upsert('exercise', e)
    const s2 = createStore({ storage: localStorage })
    expect(s2.get('exercise', e.id).name).toBe('Paradiddle')
  })

  it('remove hides from list but keeps the tombstone', () => {
    const s = createStore({ storage: localStorage })
    const e = newExercise({ name: 'A' })
    s.upsert('exercise', e)
    s.remove('exercise', e.id)
    expect(s.list('exercise')).toEqual([])
    const t = s.getState().exercise[e.id]
    expect(t.deletedAt).toBe(t.updatedAt)
    expect(t.deletedAt).toBeGreaterThan(0)
  })

  it('dirty queue survives reload', () => {
    const s = createStore({ storage: localStorage })
    const e = newExercise({ name: 'A' })
    s.upsert('exercise', e)
    const s2 = createStore({ storage: localStorage })
    expect(s2.takeDirty()).toEqual([{ kind: 'exercise', id: e.id }])
    expect(s2.takeDirty()).toEqual([])
    expect(createStore({ storage: localStorage }).takeDirty()).toEqual([])
  })

  it('takeDirty deduplicates and markDirty re-queues', () => {
    const s = createStore({ storage: localStorage })
    const e = newExercise()
    s.upsert('exercise', e)
    s.upsert('exercise', { ...e, name: 'x' })
    const d = s.takeDirty()
    expect(d).toHaveLength(1)
    s.markDirty('exercise', e.id)
    expect(s.takeDirty()).toEqual(d)
  })

  it('storage event merges other window', () => {
    const s = createStore({ storage: localStorage })
    const e = newExercise({ name: 'old' })
    s.upsert('exercise', e)
    const fn = vi.fn()
    s.subscribe(fn)
    const raw = JSON.parse(localStorage.getItem(KEY))
    raw.state.exercise[e.id] = { ...e, name: 'new', updatedAt: e.updatedAt + 1000 }
    localStorage.setItem(KEY, JSON.stringify(raw))
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(fn).toHaveBeenCalled()
    expect(s.get('exercise', e.id).name).toBe('new')
  })

  it('quota error calls onError and keeps memory', () => {
    const real = localStorage
    const storage = {
      getItem: (k) => real.getItem(k),
      setItem: () => { throw new Error('full') },
      removeItem: (k) => real.removeItem(k),
      key: (i) => real.key(i),
      get length() { return real.length },
    }
    const onError = vi.fn()
    const s = createStore({ storage, onError })
    const e = newExercise({ name: 'A' })
    s.upsert('exercise', e)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'quota' }))
    expect(s.get('exercise', e.id).name).toBe('A')
  })

  it('corrupt JSON is backed up and reported', () => {
    localStorage.setItem(KEY, '{not json')
    const onError = vi.fn()
    const s = createStore({ storage: localStorage, onError })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ type: 'corrupt' }))
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('dp-corrupt-'))
    expect(keys).toHaveLength(1)
    expect(localStorage.getItem(keys[0])).toBe('{not json')
    expect(s.list('exercise')).toEqual([])
  })

  it('boot removes sb- keys but keeps dp-data-v3', () => {
    localStorage.setItem('sb-abc-auth-token', 'x')
    localStorage.setItem('dp-data-v3', 'y')
    createStore({ storage: localStorage })
    expect(localStorage.getItem('sb-abc-auth-token')).toBeNull()
    expect(localStorage.getItem('dp-data-v3')).toBe('y')
  })

  it('empty store has default prefs, not dirty', () => {
    const s = createStore({ storage: localStorage })
    const p = s.get('prefs', 'prefs')
    expect(p.id).toBe('prefs')
    expect(p.updatedAt).toBe(0)
    expect(s.takeDirty()).toEqual([])
  })

  it('upsert/remove timestamps are monotonic and mark dirty', () => {
    vi.useFakeTimers()
    vi.setSystemTime(5000)
    const s = createStore({ storage: localStorage })
    const e = newExercise()
    s.upsert('exercise', e)
    expect(s.get('exercise', e.id).updatedAt).toBe(5000)
    s.takeDirty()
    vi.setSystemTime(1000) // clock went backwards
    s.upsert('exercise', { ...e, name: 'b' })
    expect(s.get('exercise', e.id).updatedAt).toBe(5001)
    s.remove('exercise', e.id)
    const t = s.get('exercise', e.id)
    expect(t.updatedAt).toBe(5002)
    expect(t.deletedAt).toBe(5002)
    expect(s.takeDirty()).toEqual([{ kind: 'exercise', id: e.id }])
    vi.useRealTimers()
  })

  it('upsert on unknown kind throws', () => {
    const s = createStore({ storage: localStorage })
    expect(() => s.upsert('nope', { id: 'x' })).toThrow()
  })

  it('applyRemote maps rows, never dirties, notifies once, ignores unknown kinds', () => {
    const s = createStore({ storage: localStorage })
    const fn = vi.fn()
    s.subscribe(fn)
    s.applyRemote([
      { kind: 'exercise', id: 'a', data: { name: 'A' }, updatedAt: 10, deleted: false },
      { kind: 'exercise', id: 'b', data: { name: 'B' }, updatedAt: 11, deleted: true },
      { kind: 'bogus', id: 'z', data: {}, updatedAt: 1, deleted: false },
    ])
    expect(fn).toHaveBeenCalledTimes(1)
    expect(s.get('exercise', 'a')).toMatchObject({ id: 'a', name: 'A', updatedAt: 10, deletedAt: null })
    expect(s.get('exercise', 'b')).toMatchObject({ deletedAt: 11 })
    expect(s.getState().bogus).toBeUndefined()
    expect(s.takeDirty()).toEqual([])
  })

  it('list sorts by name (es) and logs by startedAt desc', () => {
    const s = createStore({ storage: localStorage })
    s.upsert('exercise', newExercise({ name: 'zeta' }))
    s.upsert('exercise', newExercise({ name: 'Álamo' }))
    s.upsert('exercise', newExercise({ name: 'beta' }))
    expect(s.list('exercise').map((e) => e.name)).toEqual(['Álamo', 'beta', 'zeta'])
    s.upsert('log', newLog({ startedAt: 1 }))
    s.upsert('log', newLog({ startedAt: 3 }))
    s.upsert('log', newLog({ startedAt: 2 }))
    expect(s.list('log').map((l) => l.startedAt)).toEqual([3, 2, 1])
  })

  it('state updates are immutable', () => {
    const s = createStore({ storage: localStorage })
    const a = s.getState()
    s.upsert('exercise', newExercise())
    const b = s.getState()
    expect(b).not.toBe(a)
    expect(b.exercise).not.toBe(a.exercise)
    expect(b.song).toBe(a.song)
  })
})
