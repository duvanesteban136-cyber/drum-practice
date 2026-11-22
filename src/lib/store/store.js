import { KINDS, defaultPrefs } from './schema.js'
import { mergeEntity, mergeState } from './merge.js'

const VERSION = 4
const NAMED = new Set(['exercise', 'fill', 'song', 'routine', 'preset'])

function emptyState() {
  const s = {}
  for (const k of KINDS) s[k] = {}
  s.prefs = { prefs: defaultPrefs({ updatedAt: 0 }) }
  return s
}

const dkey = (kind, id) => `${kind}\u0000${id}`

export function createStore({ storage = window.localStorage, key = 'dp-v4', onError } = {}) {
  let state = emptyState()
  const dirty = new Map() // dkey -> {kind,id}
  const subs = new Set()

  const notify = () => subs.forEach((fn) => fn(state))

  function readStored() {
    try {
      const raw = storage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || typeof parsed.state !== 'object' || !parsed.state) return null
      return parsed
    } catch {
      return null
    }
  }

  // Merge what is stored into memory. Returns true if memory state changed.
  function absorb(stored, { withDirty = true } = {}) {
    if (!stored) return false
    const merged = mergeState(state, stored.state)
    const changed = KINDS.some((k) => merged[k] !== state[k])
    if (changed) state = merged
    if (withDirty && Array.isArray(stored.dirty)) {
      for (const d of stored.dirty) {
        if (d && typeof d.kind === 'string' && typeof d.id === 'string') dirty.set(dkey(d.kind, d.id), { kind: d.kind, id: d.id })
      }
    }
    return changed
  }

  function persist({ withDirty = true } = {}) {
    const changed = absorb(readStored(), { withDirty })
    try {
      storage.setItem(key, JSON.stringify({ v: VERSION, state, dirty: [...dirty.values()] }))
    } catch (error) {
      onError?.({ type: 'quota', error })
    }
    return changed
  }

  // boot
  for (const k of Object.keys(storage).filter((k) => k.startsWith('sb-'))) {
    try { storage.removeItem(k) } catch { /* ignore */ }
  }
  try {
    const raw = storage.getItem(key)
    if (raw) {
      let ok = false
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed.state === 'object' && parsed.state) {
          absorb(parsed)
          ok = true
        }
      } catch { /* corrupt */ }
      if (!ok) {
        try { storage.setItem(`dp-corrupt-${Date.now()}`, raw) } catch { /* ignore */ }
        onError?.({ type: 'corrupt' })
      }
    }
  } catch { /* storage unreadable */ }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return
      if (absorb(readStored())) notify()
    })
  }

  function stamp(kind, id, build) {
    const prev = state[kind]?.[id]
    const t = Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1)
    const next = build(t)
    state = { ...state, [kind]: { ...state[kind], [id]: next } }
    dirty.set(dkey(kind, id), { kind, id })
    persist()
    notify()
    return next
  }

  return {
    getState: () => state,
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
    get: (kind, id) => state[kind]?.[id],
    list(kind) {
      const items = Object.values(state[kind] || {}).filter((e) => !e.deletedAt)
      if (kind === 'log') return items.sort((a, b) => b.startedAt - a.startedAt)
      if (NAMED.has(kind)) return items.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      return items
    },
    upsert(kind, entity) {
      if (!KINDS.includes(kind)) throw new Error(`Unknown kind: ${kind}`)
      return stamp(kind, entity.id, (t) => ({ ...entity, updatedAt: t }))
    },
    remove(kind, id) {
      if (!KINDS.includes(kind)) throw new Error(`Unknown kind: ${kind}`)
      const prev = state[kind]?.[id]
      return stamp(kind, id, (t) => ({ ...(prev || { id }), updatedAt: t, deletedAt: t }))
    },
    applyRemote(rows) {
      let next = state
      for (const r of rows || []) {
        if (!KINDS.includes(r.kind)) continue
        const entity = {
          ...r.data,
          id: r.id,
          updatedAt: r.updatedAt,
          deletedAt: r.deleted ? (r.data?.deletedAt ?? r.updatedAt) : null,
        }
        const prev = next[r.kind][r.id]
        const winner = mergeEntity(prev, entity)
        if (winner !== prev) next = { ...next, [r.kind]: { ...next[r.kind], [r.id]: winner } }
      }
      if (next !== state) {
        state = next
        persist()
      }
      notify()
    },
    takeDirty() {
      absorb(readStored()) // pull in other windows' pending marks
      const out = [...dirty.values()]
      dirty.clear()
      persist({ withDirty: false })
      return out
    },
    markDirty(kind, id) {
      dirty.set(dkey(kind, id), { kind, id })
      persist()
    },
  }
}
