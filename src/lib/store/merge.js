import { KINDS } from './schema.js'

/** Last-writer-wins by updatedAt; ties break deterministically by JSON order. */
export function mergeEntity(a, b) {
  if (!a) return b
  if (!b) return a
  const ta = a.updatedAt ?? 0
  const tb = b.updatedAt ?? 0
  if (ta !== tb) return ta > tb ? a : b
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b
}

/** Per-kind, per-id merge. Kind maps that do not change keep their reference. */
export function mergeState(local = {}, remote = {}) {
  const out = {}
  for (const kind of KINDS) {
    const l = local[kind] || {}
    const r = remote[kind] || {}
    let result = l
    for (const id of Object.keys(r)) {
      const winner = mergeEntity(l[id], r[id])
      if (winner !== result[id]) {
        if (result === l) result = { ...l }
        result[id] = winner
      }
    }
    out[kind] = result
  }
  return out
}
