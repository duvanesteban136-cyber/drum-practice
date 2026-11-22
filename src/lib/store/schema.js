import { uid } from '../ids.js'
import { dayKey } from '../dates.js'

export const KINDS = ['exercise', 'fill', 'song', 'routine', 'log', 'preset', 'prefs']

const base = (id) => ({ id, updatedAt: Date.now(), deletedAt: null })

export function newExercise(patch = {}) {
  return {
    ...base(uid()),
    name: '',
    categoryId: 'manos',
    notes: '',
    imageId: null,
    durationSec: 120,
    velocityMode: 'fixed',
    bpm: 80,
    bpmStart: 60,
    bpmEnd: 100,
    rampType: 'gradual',
    rampStepBars: 4,
    rampStepBpm: 2,
    goalBpm: null,
    bestCleanBpm: null,
    meter: { num: 4, den: 4 },
    feel: 'simple',
    subdivision: 1,
    gap: { enabled: false, introBars: 1, playBars: 2, muteBars: 2, mode: 'full' },
    poly: { enabled: false, n: 3 },
    ...patch,
  }
}

export function newFill(patch = {}) {
  return {
    ...base(uid()),
    type: 'fill',
    name: '',
    bpm: 80,
    notes: '',
    imageId: null,
    localMediaId: null,
    phrase: { grooveBars: 3, fillBars: 1 },
    lastPracticed: null,
    ...patch,
  }
}

export function newSong(patch = {}) {
  return {
    ...base(uid()),
    name: '',
    artist: '',
    bpm: null,
    notes: '',
    localMediaId: null,
    speed: 1,
    loopA: null,
    loopB: null,
    ...patch,
  }
}

export function newRoutine(patch = {}) {
  return { ...base(uid()), name: 'Mi rutina', blocks: [], days: [], ...patch }
}

export function newBlock(type, patch = {}) {
  return { id: uid(), type, ...patch }
}

export function newLog(patch = {}) {
  return {
    ...base(uid()),
    date: dayKey(),
    startedAt: Date.now(),
    endedAt: null,
    activeSec: 0,
    kind: 'routine',
    routineId: null,
    routineName: '',
    status: 'completed',
    items: [],
    ...patch,
  }
}

export function newPreset(patch = {}) {
  return { ...base(uid()), name: '', ...patch }
}

export function defaultPrefs(patch = {}) {
  return {
    ...base('prefs'),
    weeklyGoalMin: 150,
    dayThresholdMin: 5,
    countInBars: 1,
    autoAdvanceSec: 5,
    askRating: true,
    flash: 'one',
    categories: [
      { id: 'manos', name: 'Manos' },
      { id: 'pies', name: 'Pies' },
      { id: 'coordinacion', name: 'Coordinación' },
      { id: 'grooves', name: 'Grooves' },
      { id: 'lectura', name: 'Lectura' },
    ],
    ...patch,
  }
}
