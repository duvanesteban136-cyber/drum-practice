export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function parseIntInput(text, { min, max, emptyMsg }) {
  const t = String(text ?? '').trim()
  if (t === '') return { value: null, error: emptyMsg }
  if (!/^\d+$/.test(t)) return { value: null, error: 'Solo números' }
  const n = Number(t)
  if (n < min || n > max) return { value: null, error: `Entre ${min} y ${max}` }
  return { value: n, error: null }
}

export function parseBpmInput(text) {
  return parseIntInput(text, { min: 20, max: 400, emptyMsg: 'Escribe un BPM' })
}

export function parseSecondsInput(text, { min = 10, max = 3600 } = {}) {
  return parseIntInput(text, { min, max, emptyMsg: 'Escribe los segundos' })
}
