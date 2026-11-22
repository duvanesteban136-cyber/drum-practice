// Pure DSP click sounds rendered as sample arrays. No files, no Web Audio needed
// except in createSoundBank, which copies the samples into AudioBuffers.
// Designed to cut through a drum kit: sharp attack, short, bright, peak-normalized.

export const SOUNDS = [
  { id: 'click', label: 'Click' },
  { id: 'wood', label: 'Madera' },
  { id: 'rim', label: 'Aro' },
  { id: 'hat', label: 'Hi-hat' },
  { id: 'cowbell', label: 'Cencerro' },
  { id: 'kick', label: 'Bombo' },
  { id: 'beep', label: 'Beep' },
  { id: 'countin', label: 'Conteo' },
]

const TARGET_PEAK = 0.9
const ATTACK_SECONDS = 0.0003
const TWO_PI = Math.PI * 2

// Tiny seeded PRNG so noise is identical for the same id.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFromId(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return h >>> 0
}

function noiseSource(id) {
  const rand = mulberry32(seedFromId(id))
  return () => rand() * 2 - 1
}

// RBJ biquad, returns a stateful sample processor. Frequency is clamped below Nyquist.
function biquad(type, freq, q, sampleRate) {
  const f = Math.min(Math.max(freq, 20), sampleRate * 0.45)
  const w = (TWO_PI * f) / sampleRate
  const cos = Math.cos(w)
  const alpha = Math.sin(w) / (2 * q)
  let b0, b1, b2
  if (type === 'bandpass') {
    b0 = alpha
    b1 = 0
    b2 = -alpha
  } else {
    b0 = (1 + cos) / 2
    b1 = -(1 + cos)
    b2 = (1 + cos) / 2
  }
  const a0 = 1 + alpha
  const a1 = (-2 * cos) / a0
  const a2 = (1 - alpha) / a0
  b0 /= a0
  b1 /= a0
  b2 /= a0
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  return (x) => {
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }
}

const expDecay = (t, tau) => Math.exp(-t / tau)
const square = (phase) => Math.tanh(3 * Math.sin(phase)) // soft square-ish partial

// Each recipe fills `out` given sample rate, pitch and noise. Times are in seconds.
const RECIPES = {
  click: { duration: 0.03, fill: (t, ctx) => 0.8 * Math.sin(TWO_PI * 2500 * ctx.pitch * t) * expDecay(t, 0.004) + 0.7 * ctx.noise() * expDecay(t, 0.0012) },
  rim: { duration: 0.02, fill: (t, ctx) => 0.7 * Math.sin(TWO_PI * 1800 * ctx.pitch * t) * expDecay(t, 0.003) + 0.9 * ctx.noise() * expDecay(t, 0.0015) },
  beep: { duration: 0.08, fill: (t, ctx) => Math.sin(TWO_PI * 1000 * ctx.pitch * t) * expDecay(t, 0.03) },
  countin: { duration: 0.09, fill: (t, ctx) => Math.sin(TWO_PI * 1600 * ctx.pitch * t) * expDecay(t, 0.035) },
  kick: {
    duration: 0.18,
    init: () => ({ phase: 0 }),
    fill: (t, ctx) => {
      const freq = (45 + 105 * expDecay(t, 0.03)) * ctx.pitch
      ctx.state.phase += (TWO_PI * freq) / ctx.sampleRate
      return Math.sin(ctx.state.phase + 1.2) * expDecay(t, 0.07) + 0.3 * ctx.noise() * expDecay(t, 0.0015)
    },
  },
  cowbell: {
    duration: 0.2,
    fill: (t, ctx) =>
      (0.6 * square(TWO_PI * 540 * ctx.pitch * t) + 0.6 * square(TWO_PI * 800 * ctx.pitch * t)) * expDecay(t, 0.07) +
      0.3 * ctx.noise() * expDecay(t, 0.002),
  },
  wood: {
    duration: 0.06,
    init: (sampleRate, pitch) => ({ bp: biquad('bandpass', 900 * pitch, 8, sampleRate) }),
    fill: (t, ctx) =>
      4 * ctx.state.bp(ctx.noise()) * expDecay(t, 0.012) +
      0.7 * Math.sin(TWO_PI * 900 * ctx.pitch * t + 1.5) * expDecay(t, 0.015),
  },
  hat: {
    duration: 0.04,
    init: (sampleRate, pitch) => ({ hp1: biquad('highpass', 6000 * pitch, 0.707, sampleRate), hp2: biquad('highpass', 6000 * pitch, 0.707, sampleRate) }),
    fill: (t, ctx) => ctx.state.hp2(ctx.state.hp1(ctx.noise())) * expDecay(t, 0.009),
  },
}

export function renderSample(id, sampleRate, pitch = 1) {
  const key = Object.hasOwn(RECIPES, id) ? id : 'click'
  const recipe = RECIPES[key]
  const length = Math.min(Math.floor(recipe.duration * sampleRate), Math.floor(0.25 * sampleRate))
  const out = new Float32Array(length)
  const ctx = {
    sampleRate,
    pitch,
    noise: noiseSource(key),
    state: recipe.init ? recipe.init(sampleRate, pitch) : null,
  }
  const fadeStart = Math.floor(length * 0.9)
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate
    let v = recipe.fill(t, ctx)
    if (t < ATTACK_SECONDS) v *= t / ATTACK_SECONDS
    if (i >= fadeStart) v *= (length - i) / (length - fadeStart) // no end click
    out[i] = v
  }
  let peak = 0
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) {
    const gain = TARGET_PEAK / peak
    for (let i = 0; i < length; i++) out[i] *= gain
  }
  return out
}

const LEVELS = [
  ['accent', 1.5],
  ['normal', 1],
  ['soft', 0.8],
]

export function createSoundBank(ac) {
  const bank = new Map()
  for (const { id } of SOUNDS) {
    const entry = {}
    for (const [level, pitch] of LEVELS) {
      const samples = renderSample(id, ac.sampleRate, pitch)
      const buffer = ac.createBuffer(1, samples.length, ac.sampleRate)
      buffer.copyToChannel(samples, 0)
      entry[level] = buffer
    }
    bank.set(id, entry)
  }
  return bank
}
