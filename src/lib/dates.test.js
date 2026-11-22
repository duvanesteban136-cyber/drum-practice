import { describe, it, expect } from 'vitest'
import { dayKey, parseDayKey, addDays, weekdayIndex, weekStart, lastNDays } from './dates.js'

describe('dates (local, America/Bogota)', () => {
  it('dayKey uses local day, not UTC', () => {
    expect(dayKey(new Date('2026-11-17T01:30:00Z'))).toBe('2026-11-16')
  })
  it('parseDayKey returns local midnight', () => {
    const d = parseDayKey('2026-11-16')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 16, 0])
  })
  it('weekdayIndex Monday=0', () => {
    expect(weekdayIndex('2026-11-16')).toBe(0)
    expect(weekdayIndex('2026-11-22')).toBe(6)
  })
  it('weekStart returns Monday', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-16')
  })
  it('addDays crosses year and month boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('lastNDays oldest first', () => {
    expect(lastNDays(3, '2026-11-21')).toEqual(['2026-11-19', '2026-11-20', '2026-11-21'])
  })
})
