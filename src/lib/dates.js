// Local-day helpers. Never use toISOString (UTC) for day keys.

const pad = (n) => String(n).padStart(2, '0')

export function dayKey(ts = Date.now()) {
  const d = ts instanceof Date ? ts : new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key, n) {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

export function weekdayIndex(key) {
  return (parseDayKey(key).getDay() + 6) % 7
}

export function weekStart(key) {
  return addDays(key, -weekdayIndex(key))
}

export function lastNDays(n, endKey = dayKey()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) out.push(addDays(endKey, -i))
  return out
}
