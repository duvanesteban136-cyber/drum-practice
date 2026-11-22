// BPM progression rules: suggest the next working BPM from a rating.
import { parseDayKey } from '../dates.js'

const MIN_BPM = 20
const MAX_BPM = 400
const IDLE_DAYS = 14
const IDLE_REASON = '14+ días sin practicar: −5 %'
const MS_PER_DAY = 86400000

const clamp = (n) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(n)))

function daysBetween(fromKey, toKey) {
  const a = parseDayKey(fromKey)
  const b = parseDayKey(toKey)
  // Date.UTC on local Y/M/D avoids DST hour drift.
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / MS_PER_DAY)
}

function fmtDelta(delta) {
  if (delta === 0) return 'mismo BPM'
  return delta > 0 ? `+${delta} BPM` : `−${Math.abs(delta)} BPM`
}

// Applies idle penalty then rating rule to a single BPM value.
function adjust(bpm, rating, idle) {
  let v = bpm
  const parts = []
  if (idle) {
    v = Math.round(v * 0.95)
    parts.push(IDLE_REASON)
  }
  if (rating === 'clean') {
    v = clamp(Math.max(Math.round(v * 1.03), v + 1))
    parts.push(`Limpio: ${fmtDelta(v - bpm)}`)
  } else if (rating === 'almost') {
    v = clamp(v)
    parts.push('Casi: mismo BPM')
  } else if (rating === 'hard') {
    v = clamp(v * 0.93)
    parts.push(`Costó: ${fmtDelta(v - bpm)}`)
  } else {
    v = clamp(v)
    if (!idle) parts.push('Sin calificación: mismo BPM')
  }
  return { value: v, reason: parts.join(' · ') }
}

export function suggestNextBpm({ mode, bpm, bpmStart, bpmEnd, rating, lastPracticedDay, todayKey }) {
  const idle = !!lastPracticedDay && !!todayKey && daysBetween(lastPracticedDay, todayKey) > IDLE_DAYS
  if (mode === 'ramp' || mode === 'steps') {
    const { value, reason } = adjust(bpmEnd, rating, idle)
    const delta = value - bpmEnd
    return { mode, bpmStart: clamp(bpmStart + delta), bpmEnd: value, reason }
  }
  const { value, reason } = adjust(bpm, rating, idle)
  return { mode, bpm: value, reason }
}

export function bestCleanBpm(history) {
  let best = null
  for (const h of history || []) {
    if (h && h.rating === 'clean' && Number.isFinite(h.endBpm) && (best === null || h.endBpm > best)) best = h.endBpm
  }
  return best
}
