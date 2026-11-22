import { describe, it, expect } from 'vitest'
import {
  KINDS, newExercise, newFill, newSong, newRoutine, newLog, newPreset, newBlock, defaultPrefs,
} from './schema.js'
import { dayKey } from '../dates.js'

describe('schema factories', () => {
  it('exposes KINDS', () => {
    expect(KINDS).toEqual(['exercise', 'fill', 'song', 'routine', 'log', 'preset', 'prefs'])
  })

  it('creates entities with unique ids and fresh updatedAt', () => {
    const a = newExercise()
    const b = newExercise()
    expect(a.id).not.toBe(b.id)
    expect(Math.abs(a.updatedAt - Date.now())).toBeLessThan(1000)
    expect(a.deletedAt).toBeNull()
  })

  it('applies patch over defaults', () => {
    const e = newExercise({ name: 'Paradiddle', bpm: 100 })
    expect(e.name).toBe('Paradiddle')
    expect(e.bpm).toBe(100)
    expect(e.categoryId).toBe('manos')
    expect(newFill({ name: 'x' }).type).toBe('fill')
    expect(newSong().speed).toBe(1)
    expect(newRoutine().name).toBe('Mi rutina')
    expect(newPreset().id).toBeTruthy()
  })

  it('does not share nested defaults between entities', () => {
    const a = newExercise()
    const b = newExercise()
    a.meter.num = 7
    a.gap.enabled = true
    a.poly.n = 5
    expect(b.meter.num).toBe(4)
    expect(b.gap.enabled).toBe(false)
    expect(b.poly.n).toBe(3)
    const r1 = newRoutine()
    r1.blocks.push(1)
    expect(newRoutine().blocks).toEqual([])
    const f = newFill()
    f.phrase.grooveBars = 9
    expect(newFill().phrase.grooveBars).toBe(3)
    const p1 = defaultPrefs()
    p1.categories.push({})
    expect(defaultPrefs().categories).toHaveLength(5)
    const l = newLog()
    l.items.push(1)
    expect(newLog().items).toEqual([])
  })

  it('newLog defaults', () => {
    const l = newLog()
    expect(l.date).toBe(dayKey())
    expect(l.endedAt).toBeNull()
    expect(l.status).toBe('completed')
    expect(l.kind).toBe('routine')
  })

  it('defaultPrefs', () => {
    const p = defaultPrefs()
    expect(p.id).toBe('prefs')
    expect(p.weeklyGoalMin).toBe(150)
    expect(p.categories[2]).toEqual({ id: 'coordinacion', name: 'Coordinación' })
    expect(p.deletedAt).toBeNull()
  })

  it('newBlock gives unique ids and keeps type', () => {
    const a = newBlock('rest', { seconds: 30 })
    const b = newBlock('rest')
    expect(a.id).not.toBe(b.id)
    expect(a.type).toBe('rest')
    expect(a.seconds).toBe(30)
  })
})
