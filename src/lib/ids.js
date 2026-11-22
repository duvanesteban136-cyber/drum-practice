export function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  let s = ''
  while (s.length < 20) s += Math.random().toString(36).slice(2)
  return s.slice(0, 20)
}
