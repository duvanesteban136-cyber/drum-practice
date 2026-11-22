# Drum Practice — Foundation (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every non-visual layer of the definitive app as tested modules: local dates, entity store with per-entity merge, media storage, the Supabase sync (tables in ipuc-trinidad + client), the new metronome engine, and the guided-session / progression logic.

**Architecture:** Pure, framework-free modules under `src/lib/` and `src/audio/` with Vitest tests next to them. React only appears in Plan 2 (screens + visual redesign from the user's reference images), which wires these modules into the UI and deletes the old screens. Nothing in this plan touches the existing UI files, so every commit still deploys the current app unchanged.

**Tech Stack:** React 19 + Vite 8 (JS, ESM), Vitest 3 + jsdom + fake-indexeddb for tests, idb-keyval for IndexedDB, Web Audio API + a Web Worker ticker, Supabase PostgREST over `fetch` (no supabase-js), WebCrypto SHA-256.

**Spec:** `docs/superpowers/specs/2026-11-21-drum-practice-definitiva-design.md` (approved 2026-11-21; Spanish). Read §6.2–§6.5, §7, §8, §12.2, §12.4 before starting.

## Global Constraints

- Start clean: no v3 data migration. Only remove localStorage keys starting with `sb-` on boot (they cause the black screen).
- Dates are always local `YYYY-MM-DD`; never derive a day from `toISOString()`.
- Every synced entity has `id`, `updatedAt` (ms), `deletedAt` (ms | null). Logs are append-only.
- localStorage key for entities: `dp-v4`. Device-local keys: `dp-v4-metro`, `dp-v4-sync`, `dp-v4-session`.
- Sync lives only in Supabase project `rxszreoapfyprmbmjvio` (ipuc-trinidad): tables `public.drum_items`, `public.drum_media`, schema `drum_private`. Never modify any other table, function, auth setting or bucket of that project.
- Sync code: 16 Crockford base32 chars shown as `XXXX-XXXX-XXXX-XXXX`; sent as header `x-drum-key`; rows keyed by lowercase hex SHA-256 of the normalized code.
- Images synced ≤ 1 MB each after compression (max side 1600 px, JPEG quality 0.82); audio/video never leave the device.
- Grid levels are `accent | normal | soft | mute` (UI: Acento / Normal / Suave / Silencio).
- Engine: BPM changes apply on the next pulse; meter, subdivision and grid changes apply at the next bar line; nothing restarts the bar.
- New code must pass `npx eslint src/lib src/audio` with zero errors (old UI files are deleted in Plan 2).
- After each task: commit and push to `main` (CLAUDE.md), with the commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Phone locks or the app goes to background mid-session → the session auto-pauses, keeps remaining time, and the engine resumes a suspended/interrupted AudioContext instead of going silent. (Tests in Task 9 `resumes a non-running context on start` and Task 11 `PAUSE on hidden keeps remaining time`.)
2. Practising offline → sync never throws into the app, keeps the pending queue across reloads, and retries later. (Task 13 `offline push keeps dirty and reports offline`, Task 4 `dirty queue survives reload`.)
3. Two windows open at once (Mac PWA + tab, iPad Split View) → edits merge per entity instead of overwriting each other. (Task 4 `storage event merges other window`.)
4. Extreme tempos (20 BPM with poly 7, 300 BPM sextuplets) → no zero/NaN durations, no missing or doubled poly hits. (Task 7 `extreme tempos`.)
5. Typing numbers (empty, "150" mid-typing, out of range) → a value is only clamped on commit, never per keystroke. (Task 3 `parseBpmInput`.)

---

## File Structure

```
src/lib/dates.js                 local day keys, weekday index (Mon=0), week/heatmap ranges
src/lib/ids.js                   uid()
src/lib/validate.js              parseBpmInput, parseSecondsInput, clamp
src/lib/store/schema.js          entity kinds, factories, default prefs
src/lib/store/merge.js           per-entity LWW merge with tombstones
src/lib/store/store.js           createStore(): persistence, subscribe, dirty queue, storage events
src/lib/store/selectors.js       today's routine, week minutes, streak, heatmap, exercise stats
src/lib/media/mediaStore.js      IndexedDB blobs (idb-keyval)
src/lib/media/image.js           fitWithin + compressImage (canvas)
src/lib/sync/config.js           Supabase URL + publishable key
src/lib/sync/syncCode.js         generate / normalize / hash sync codes
src/lib/sync/api.js              PostgREST calls with x-drum-key
src/lib/sync/syncEngine.js       createSyncEngine(): enable/join/disable/syncNow/status
src/lib/practice/progression.js  next-BPM suggestion, best clean BPM
src/lib/practice/sessionPlan.js  routine + library -> steps; estimates
src/lib/practice/sessionReducer.js guided-session state machine
src/audio/timing.js              beat structure, pulse durations, swing, default accents
src/audio/planner.js             planBar(): events for one bar (gap, random mute, poly, trainer, count-in)
src/audio/sounds.js              synthesized sound buffers
src/audio/engine.js              MetronomeEngine class (Web Audio scheduling, snapshot store)
src/audio/ticker.worker.js       25 ms tick worker
supabase/migrations/20261121_drum_sync.sql
```

Tests live next to each module as `*.test.js`.

---

### Task 1: Test tooling and dependency cleanup

**Files:**
- Modify: `package.json` (scripts + deps), `vite.config.js` (test block)
- Create: `src/lib/ids.js`, `src/lib/ids.test.js`

**Interfaces:**
- Produces: `uid(): string` (crypto.randomUUID when available, else 20 random base36 chars); `npm test` runs Vitest once.

- [ ] **Step 1:** `npm uninstall tone lucide-react` and `npm install idb-keyval@6` and `npm install -D vitest@3 jsdom fake-indexeddb` (keep recharts and @supabase/supabase-js until Plan 2 deletes the old UI).
- [ ] **Step 2:** Add scripts `"test": "vitest run"`, `"test:watch": "vitest"`; add to `vite.config.js`: `test: { environment: 'node', include: ['src/**/*.test.js'] }`.
- [ ] **Step 3: Write the failing test** `src/lib/ids.test.js`: `uid()` returns a string of length ≥ 16; 1000 calls produce 1000 distinct values.
- [ ] **Step 4:** Run `npm test` → FAIL (module not found). Implement `uid()` in `src/lib/ids.js`. Run `npm test` → PASS. Run `npm run build` → succeeds.
- [ ] **Step 5: Commit** `chore: add vitest, idb-keyval; drop unused tone and lucide-react` and push.

### Task 2: Local dates

**Files:** Create `src/lib/dates.js`, `src/lib/dates.test.js`

**Interfaces:**
- Produces: `dayKey(ts: number|Date = Date.now()): string` ('YYYY-MM-DD', local); `parseDayKey(key: string): Date` (local midnight); `addDays(key: string, n: number): string`; `weekdayIndex(key: string): 0..6` (Mon=0); `weekStart(key: string): string` (Monday); `lastNDays(n: number, endKey?: string): string[]` (oldest first).

- [ ] **Step 1: Write the failing tests** (run with `process.env.TZ = 'America/Bogota'` set at the top of the file before importing):
  - `dayKey(new Date('2026-11-17T01:30:00Z'))` === `'2026-11-16'` (20:30 Monday in Bogotá)
  - `weekdayIndex('2026-11-16')` === 0; `weekdayIndex('2026-11-22')` === 6
  - `weekStart('2026-11-22')` === `'2026-11-16'`
  - `addDays('2026-12-31', 1)` === `'2027-01-01'`; `addDays('2026-03-01', -1)` === `'2026-02-28'`
  - `lastNDays(3, '2026-11-21')` deep-equals `['2026-11-19','2026-11-20','2026-11-21']`
- [ ] **Step 2:** `npx vitest run src/lib/dates.test.js` → FAIL. Implement with `Date` local getters only. Re-run → PASS.
- [ ] **Step 3: Commit** `feat(lib): local date helpers` and push.

### Task 3: Schema, factories and input validation

**Files:** Create `src/lib/store/schema.js`, `src/lib/validate.js`, tests `src/lib/store/schema.test.js`, `src/lib/validate.test.js`

**Interfaces:**
- Produces:
  - `KINDS = ['exercise','fill','song','routine','log','preset','prefs']`
  - `newExercise(patch?)`, `newFill(patch?)`, `newSong(patch?)`, `newRoutine(patch?)`, `newLog(patch?)`, `newPreset(patch?)`, `defaultPrefs()` — each returns `{id, updatedAt, deletedAt: null, ...defaults, ...patch}` (prefs has `id: 'prefs'`).
  - Exercise defaults: `{name:'', categoryId:'manos', notes:'', imageId:null, durationSec:120, velocityMode:'fixed', bpm:80, bpmStart:60, bpmEnd:100, rampType:'gradual', rampStepBars:4, rampStepBpm:2, goalBpm:null, bestCleanBpm:null, meter:{num:4,den:4}, feel:'simple', subdivision:1, gap:{enabled:false,introBars:1,playBars:2,muteBars:2,mode:'full'}, poly:{enabled:false,n:3}}`
  - Fill defaults: `{type:'fill', name:'', bpm:80, notes:'', imageId:null, localMediaId:null, phrase:{grooveBars:3, fillBars:1}, lastPracticed:null}`
  - Song defaults: `{name:'', artist:'', bpm:null, notes:'', localMediaId:null, speed:1, loopA:null, loopB:null}`
  - Routine defaults: `{name:'Mi rutina', blocks:[], days:[]}`; block: `{id, type:'warmup'|'exercise'|'rest'|'fill'|'song', refId?, bars?, seconds?, bpm?, reps?, durationOverride?}`
  - Log defaults: `{date, startedAt, endedAt, activeSec:0, kind:'routine', routineId:null, routineName:'', status:'completed', items:[]}`
  - `defaultPrefs()`: `{id:'prefs', weeklyGoalMin:150, dayThresholdMin:5, countInBars:1, autoAdvanceSec:5, askRating:true, flash:'one', categories:[{id:'manos',name:'Manos'},{id:'pies',name:'Pies'},{id:'coordinacion',name:'Coordinación'},{id:'grooves',name:'Grooves'},{id:'lectura',name:'Lectura'}], updatedAt, deletedAt:null}`
  - `parseBpmInput(text: string): {value: number|null, error: string|null}` — trims; '' → `{value:null, error:'Escribe un BPM'}`; non-integer → error `'Solo números'`; <20 or >400 → error `'Entre 20 y 400'` with value null; else value.
  - `parseSecondsInput(text, {min=10, max=3600})` same contract, messages `'Escribe los segundos'`, `'Solo números'`, `` `Entre ${min} y ${max}` ``.
  - `clamp(v, lo, hi)`.
- [ ] **Step 1: Write the failing tests:** factory ids unique and `updatedAt` ≈ now; patch overrides defaults; `defaultPrefs().id === 'prefs'`; `parseBpmInput('')`, `'15'`, `'150'`, `'abc'`, `' 90 '` → expected results above; `parseSecondsInput('5')` → error `'Entre 10 y 3600'`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(store): entity schema and input validation` and push.

### Task 4: Per-entity merge and the store

**Files:** Create `src/lib/store/merge.js`, `src/lib/store/store.js`, tests `merge.test.js`, `store.test.js` (store test file starts with `// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `KINDS`, factories (Task 3).
- Produces:
  - State shape `{ exercise: {[id]: entity}, fill: {...}, song: {...}, routine: {...}, log: {...}, preset: {...}, prefs: {prefs: entity} }`.
  - `mergeEntity(a, b)` → the one with greater `updatedAt`; tie → the one whose JSON string sorts greater (deterministic).
  - `mergeState(local, remote)` → merged state, per kind and id.
  - `createStore({ storage = window.localStorage, key = 'dp-v4', onError })` → `{ getState(), subscribe(fn) → unsubscribe, upsert(kind, entity), remove(kind, id) /* sets deletedAt+updatedAt */, applyRemote(rows: {kind, id, data, updatedAt, deleted}[]), takeDirty(): {kind,id}[], markDirty(kind,id), list(kind) /* not deleted, sorted by name or startedAt */, get(kind,id) }`.
  - Persistence: on every change, read the stored JSON, `mergeState` it with memory, write `{v:4, state, dirty:[...]}`. `setItem` errors call `onError({type:'quota', error})` and keep memory state. Corrupt JSON on load → copy the raw string to `dp-corrupt-<Date.now()>`, call `onError({type:'corrupt'})`, start empty. Boot removes every localStorage key starting with `sb-`.
  - `window` `storage` event for `key` → merge into memory, notify subscribers.
- [ ] **Step 1: Write the failing tests:**
  - merge: newer `updatedAt` wins; a tombstone (`deletedAt`) newer than an edit wins; an edit newer than a tombstone revives; equal timestamps resolve identically regardless of argument order.
  - store: `upsert` then new store on same storage → entity present (`persists across reload`); `remove` hides it from `list` but keeps the tombstone in state; `dirty queue survives reload` (`takeDirty()` on a fresh store returns the pending pair); `storage event merges other window` (write a newer entity directly into storage JSON, dispatch `new StorageEvent('storage', {key:'dp-v4'})`, expect subscriber called and `get()` returns the newer one); quota: storage whose `setItem` throws → `onError` called with `type:'quota'` and `get()` still returns the entity; corrupt JSON → `dp-corrupt-*` key exists and `onError` type `'corrupt'`; boot deletes `sb-abc-auth-token` but keeps `dp-data-v3`.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS. `npx eslint src/lib` → clean.
- [ ] **Step 3: Commit** `feat(store): entity store with per-entity merge and dirty queue` and push.

### Task 5: Selectors (today, week, streak, heatmap, exercise stats)

**Files:** Create `src/lib/store/selectors.js`, `selectors.test.js` (TZ America/Bogota)

**Interfaces:**
- Consumes: state shape (Task 4), `dayKey`, `weekdayIndex`, `lastNDays` (Task 2).
- Produces:
  - `routineForDay(state, dayKey) → routine|null` (first non-deleted routine whose `days` includes `weekdayIndex(dayKey)`).
  - `minutesByDay(state, dayKeys: string[]) → number[]` (sum of `activeSec/60` of logs with matching `date`, rounded to 1 decimal).
  - `weekSummary(state, todayKey, goalMin) → {days: {key, minutes, planned: boolean}[7], totalMin, goalMin, practicedDays}`.
  - `streak(state, todayKey, thresholdMin) → {current, best}` — a day counts when its minutes ≥ threshold; today not yet counting does not break the streak.
  - `heatmap(state, todayKey, weeks = 12) → {key, minutes}[]` (weeks×7, Monday-aligned, oldest first).
  - `exerciseHistory(state, exerciseId) → {date, startBpm, endBpm, rating, seconds}[]` from log items (`type:'exercise'`, `refId`), oldest first.
  - `totals(state) → {hours, sessions, avgMin}` (sessions with activeSec ≥ 60 only).
- [ ] **Step 1: Write the failing tests:** evening sessions on 5 consecutive local days (20:30) → `current === 5`; a day with 3 minutes when threshold is 5 → streak breaks there; today empty + yesterday practiced → current counts yesterday's run; `weekSummary` marks planned days from routine `days`; `heatmap` length 84 and last key === today; `totals` ignores a 0-second log; `routineForDay` ignores deleted routines.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(store): selectors for today, week, streak, heatmap and stats` and push.

### Task 6: Exercise progression rules

**Files:** Create `src/lib/practice/progression.js`, `progression.test.js`

**Interfaces:**
- Produces:
  - `suggestNextBpm({ mode, bpm, bpmStart, bpmEnd, rating, lastPracticedDay, todayKey }) → { mode, bpm?, bpmStart?, bpmEnd?, reason: string }`
    - fixed: Limpio (`'clean'`) → `round(bpm*1.03)` (at least +1); Casi (`'almost'`) → same; Costó (`'hard'`) → `round(bpm*0.93)`; more than 14 days since `lastPracticedDay` → additionally ×0.95 before the rating rule. Clamp 20–400.
    - ramp/steps: apply the same delta to `bpmEnd`, shift `bpmStart` by the same absolute amount (keeps the width).
    - `reason` in Spanish, e.g. `'Limpio: +3 BPM'`, `'Casi: mismo BPM'`, `'Costó: −6 BPM'`, `'14+ días sin practicar: −5 %'`.
  - `bestCleanBpm(history) → number|null` (max `endBpm` where `rating === 'clean'`).
- [ ] **Step 1: Write the failing tests:** fixed 100 clean → 103; fixed 30 clean → 31; fixed 100 hard → 93; ramp 60→100 clean → 63→103; 20 days idle + almost at 100 → 95; clamp at 400; `bestCleanBpm` ignores non-clean.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(practice): BPM progression rules` and push.

### Task 7: Metronome timing and bar planner (pure)

**Files:** Create `src/audio/timing.js`, `src/audio/planner.js`, tests `timing.test.js`, `planner.test.js`

**Interfaces:**
- Produces:
  - `MetroConfig` (JSDoc typedef in `planner.js`): `{ bpm, meter:{num,den}, feel:'simple'|'compound', subdivision, grid: {level, sound}[]|null, sounds:{accent,normal,soft}, volume:{master, subdivision}, swing, countInBars, gap:{enabled,introBars,playBars,muteBars,mode:'full'|'one'|'offbeat',hideVisual}, randomMute:{enabled,percent,protectOne}, poly:{enabled,n,sound,volume}, trainer:{enabled,type:'ramp'|'steps',targetBpm,rampSeconds,stepBars,stepBpm,onReach:'hold'|'stop'|'restart'} }` and `defaultMetroConfig()` (bpm 100, 4/4 simple, subdivision 1, sounds click/click/click, volume {master:0.9, subdivision:0.6}, swing 50, countInBars 1, all features disabled, gap {introBars 1, playBars 2, muteBars 2, mode 'full', hideVisual true}, randomMute {percent 25, protectOne true}, poly {n 3, sound 'wood', volume 0.7}, trainer {type 'ramp', targetBpm 140, rampSeconds 120, stepBars 4, stepBpm 2, onReach 'hold'}).
  - `beatStructure(meter, feel, subdivision) → {beatsPerBar, pulsesPerBeat, beatUnit:'half'|'quarter'|'dotted-quarter'|'eighth'|'sixteenth'}` — compound only when `den===8 && num%3===0 && num>=6`; compound beats = num/3 and pulsesPerBeat ∈ {1,3,6}.
  - `defaultGrid(meter, feel, subdivision) → {level, sound:null}[]` — pulse 0 accent; other beat starts normal (compound: beats 2..n normal too); in-between pulses soft.
  - `pulseDurations(bpm, structure, swing) → number[]` (seconds for each pulse of one bar; swing applies only when pulsesPerBeat is 2 or 4: within each pair the first lasts `2·p·S/100`, the second `2·p·(100−S)/100`, where p = 60/bpm/pulsesPerBeat).
  - `planBar(config, state, rng = Math.random) → { events: {at, kind:'main'|'poly'|'countin', level, sound, gain}[], duration, visual: {pulseAt: number[], silent: boolean[]}, nextState }` where `state = { barIndex, countInLeft, gapBar, trainerBpm, trainerElapsed, trainerPaused, reached }` (`initialPlayState(config)` exported). `at` is seconds from bar start.
- [ ] **Step 1: Write the failing tests** (`timing.test.js`): 4/4 sub 1 at 120 → 4 pulses of 0.5 s; 6/8 compound sub 3 at 60 → 6 pulses of 1/3 s, `beatsPerBar` 2; 5/8 → simple, beatUnit eighth; swing 75 with sub 2 at 60 → durations alternate 0.75/0.25 and the bar totals 4.0 s; swing ignored for sub 3; `defaultGrid(6/8 compound, 3)` levels `['accent','soft','soft','normal','soft','soft']`.
- [ ] **Step 2: Write the failing tests** (`planner.test.js`):
  - count-in: `countInBars 1` → first bar events all `kind:'countin'`, gap and trainer state unchanged after it.
  - gap: introBars 1, play 2, mute 2, mode 'full' → bars after count-in: sounding, sounding, sounding(intro counted first), muted, muted, sounding… (assert the exact sequence for 8 bars); mode 'one' → muted bars keep only pulse 0; mode 'offbeat' with sub 1 plays the half-beat offbeats at normal level (gap is never fully silent in 'offbeat').
  - random mute with an injected rng returning 0 → every pulse muted except pulse 0 when `protectOne`; poly hits are not affected by random mute.
  - poly 3 over 4/4 at 100 BPM → poly events at exactly 0, 0.8, 1.6 s; poly 7 at 20 BPM → 7 events, all `at < duration`.
  - trainer ramp 100→140 over 60 s → after planning bars until elapsed ≥ 60 s, `trainerBpm === 140` and stays 140 (hold); steps +2 every 4 bars capped at target 104 → BPM sequence 100×4, 102×4, 104… never 106; `onReach:'stop'` sets `nextState.reached` and `stop: true` on the result.
  - `extreme tempos`: 300 BPM sub 6 → 24 pulses, every duration > 0 and finite; 20 BPM sub 1 → durations 3 s.
- [ ] **Step 3:** Run → FAIL. Implement `timing.js` then `planner.js`. Run → PASS. `npx eslint src/audio` clean.
- [ ] **Step 4: Commit** `feat(audio): pure timing and bar planner` and push.

### Task 8: Sound synthesis

**Files:** Create `src/audio/sounds.js`, `sounds.test.js`

**Interfaces:**
- Produces: `SOUNDS = [{id:'click',label:'Click'},{id:'wood',label:'Madera'},{id:'rim',label:'Aro'},{id:'hat',label:'Hi-hat'},{id:'cowbell',label:'Cencerro'},{id:'kick',label:'Bombo'},{id:'beep',label:'Beep'},{id:'countin',label:'Conteo'}]`; `renderSample(id: string, sampleRate: number, pitch = 1): Float32Array` (pure DSP, ≤ 0.25 s, peak ≤ 0.95, attack < 2 ms); `createSoundBank(ac: BaseAudioContext): Map<string, {accent: AudioBuffer, normal: AudioBuffer, soft: AudioBuffer}>` (accent rendered at pitch 1.5, soft at 0.8).
- [ ] **Step 1: Write the failing tests:** for every id, `renderSample(id, 48000)` has length ≤ 12000, max |x| ≤ 0.95 and > 0.2, and reaches 80 % of its peak within the first 96 samples; `renderSample('hat', 48000)` differs between two pitches.
- [ ] **Step 2:** Run → FAIL. Implement (tone + noise envelopes; no external files). Run → PASS.
- [ ] **Step 3: Commit** `feat(audio): synthesized sound bank` and push.

### Task 9: MetronomeEngine

**Files:** Create `src/audio/engine.js`, `src/audio/ticker.worker.js`, `engine.test.js` (uses a fake AudioContext and a manual ticker defined in the test file)

**Interfaces:**
- Consumes: `planBar`, `initialPlayState`, `defaultMetroConfig` (Task 7), `createSoundBank` (Task 8).
- Produces: `class MetronomeEngine` with
  - `constructor({ createContext = () => new AudioContext(), createTicker = defaultWorkerTicker, lookahead = 0.12 })` — `createTicker(onTick) → {start(), stop()}`.
  - `start(config: MetroConfig): Promise<void>` — on the user gesture: creates/reuses the context, sets `navigator.audioSession.type = 'playback'` when available, calls `resume()` whenever `state !== 'running'`, creates a fresh master `GainNode` for this run (run id), schedules from `currentTime + 0.05`.
  - `stop()` — ramps the run's master gain to 0 over 15 ms, disconnects it, stops the ticker, sets snapshot `playing:false`. Calls from an older run id are ignored.
  - `update(patch: Partial<MetroConfig>)` — BPM/volume/sounds take effect from the next pulse; meter/feel/subdivision/grid/gap/poly take effect at the next bar line.
  - `pauseTrainer()` / `resumeTrainer()`.
  - `subscribe(fn) → unsubscribe`, `getSnapshot() → { playing, phase:'idle'|'countin'|'play', bar, pulse, pulseInBar, beatInBar, bpm, gap:{section:'intro'|'play'|'mute', barInSection, sectionLength}|null, trainer:{bpm, target, paused, reached}|null, countInLeft }` — a new object only when a value changes (stable for `useSyncExternalStore`); visual pulses are emitted at their audio time minus `ac.outputLatency || 0`.
  - `onBar(fn) → unsubscribe` — called with `{barIndex, startTime}` when each bar starts sounding.
  - `on('error', fn)` — emits `'audio-not-running'` if the context is not `running` 300 ms after `start`.
- [ ] **Step 1: Write the failing tests:**
  - `schedules ahead`: after `start(defaultMetroConfig())` and one tick at t=0, the fake context received sources whose start times cover [0.05, 0.05+lookahead].
  - `stop silences queued notes`: after `stop()`, the run gain received `linearRampToValueAtTime(0, ≤ now+0.02)` and later ticks schedule nothing.
  - `bpm applies next pulse`: `update({bpm:120})` mid-bar → the next scheduled pulse uses 0.5 s spacing, earlier ones unchanged.
  - `meter applies at bar line`: `update({meter:{num:3,den:4}})` mid-bar → the current bar still has 4 pulses, the next has 3; no two onsets closer than 40 ms.
  - `late tick catch-up`: advance the fake clock 1.0 s without ticking, then tick → no event scheduled in the past, no two events within 5 ms, the bar/pulse counters advanced by the skipped pulses (pulse 0 of the following bar lands on an accent).
  - `resumes a non-running context on start`: fake context state `'interrupted'` → `resume` called; if still not running after 300 ms (fake timers) → `'audio-not-running'` emitted.
  - `stale run ignored`: start → stop → start; a delayed resume from run 1 resolving does not schedule anything.
  - `snapshot stable`: two `getSnapshot()` calls without a pulse return the same object.
- [ ] **Step 2:** Run → FAIL. Implement `engine.js` (a `ticker.worker.js` posting `'tick'` every 25 ms; `defaultWorkerTicker` falls back to `setInterval` when `Worker` is unavailable). Run → PASS.
- [ ] **Step 3:** `npm run build` succeeds (worker bundled via `new Worker(new URL('./ticker.worker.js', import.meta.url), {type:'module'})`).
- [ ] **Step 4: Commit** `feat(audio): MetronomeEngine with worker ticker and per-run gain` and push.

### Task 10: Session plan and estimates

**Files:** Create `src/lib/practice/sessionPlan.js`, `sessionPlan.test.js`

**Interfaces:**
- Consumes: state shape (Task 4), `defaultMetroConfig` (Task 7), prefs (Task 3).
- Produces:
  - `buildSessionPlan(routine, state, prefs) → { steps: Step[], warnings: string[] }` with `Step = { id, blockId, type, name, refId?, notes?, imageId?, seconds?, bars?, reps?, metro?: MetroConfig, ramp?: {from, to, type, stepBars, stepBpm}, missing?: true }`.
    - exercise → `metro` from the exercise (meter, feel, subdivision, gap, poly; `bpm` = fixed `bpm` or ramp `bpmStart`; trainer enabled for ramp with `targetBpm: bpmEnd`, `rampSeconds: 0.75 × seconds`, `onReach:'hold'`; steps type → trainer `type:'steps'`), `seconds` = `durationOverride ?? durationSec`, `countInBars` from prefs.
    - warmup → `bars` (default 4) at `block.bpm ?? next exercise's start BPM ?? 80`, metro 4/4 sub 1.
    - rest → `seconds` (default 30).
    - fill → `metro` at fill.bpm, `bars = (phrase.grooveBars + phrase.fillBars) × (block.reps ?? 4)`.
    - song → `refId`, no metro.
    - a block whose `refId` entity is missing or deleted → `missing: true`, excluded from `steps`, one warning `'Se omitió un bloque: el elemento fue borrado'`.
  - `estimateSeconds(step) → number` (bars → bars × beatsPerBar × 60/bpm; song → 180 when unknown) and `estimatePlanSeconds(plan) → number`.
- [ ] **Step 1: Write the failing tests:** a routine with warmup, fixed exercise (90 BPM, 20 s), rest 15, ramp exercise (60→100, 120 s), fill (3+1 × 2 reps at 80), song → 6 steps in order with the values above (warmup bpm 90; ramp trainer targetBpm 100, rampSeconds 90); `durationOverride` wins; a deleted exercise → excluded + warning; `estimatePlanSeconds` equals the sum of `estimateSeconds` (warmup 4 bars at 90 = 10.67 s).
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(practice): session plan builder and estimates` and push.

### Task 11: Guided-session state machine

**Files:** Create `src/lib/practice/sessionReducer.js`, `sessionReducer.test.js`

**Interfaces:**
- Consumes: `Step` (Task 10), `newLog` (Task 3), `dayKey` (Task 2).
- Produces:
  - `initSession(plan, { routineId, routineName, askRating = true, now }) → SessionState` = `{ status:'ready', idx:0, phase:'prep', steps, routineId, routineName, askRating, startedAt:null, activeMs:0, stepActiveMs:0, lastTickAt:null, results:[], pendingRating:null }`.
  - `sessionReducer(state, action) → SessionState`, actions (all carry `now` ms):
    - `START` → status `'running'`, phase `'countin'` for metro steps / `'play'` for rest and song.
    - `TICK` → accumulates `activeMs` and `stepActiveMs` only while running.
    - `COUNTIN_DONE` → phase `'play'`.
    - `STEP_TIME_UP` (dispatched by the UI at the bar line after `seconds`/`bars` elapse) → exercise/fill when `state.askRating` → phase `'rate'` with `pendingRating = {stepId, startBpm, endBpm}`; others → result `done` and advance.
    - `RATE {rating}` / `RATE_TIMEOUT` (rating `null`) → push result, advance.
    - `PAUSE` → status `'paused'`, timers frozen; `RESUME` → status `'running'`, phase `'countin'` for metro steps.
    - `NEXT` → current step result `skipped` (or `partial` if `stepActiveMs ≥ 5000`), advance.
    - `BACK` → if `stepActiveMs > 3000` restart the current step, else go to the previous step (its earlier result is removed).
    - `BPM_CHANGE {bpm}` → updates the current step's live `endBpm`.
    - `EXIT` / advancing past the last step → status `'summary'`.
  - `buildLog(state, { now }) → log entity` (`newLog`): `date: dayKey(startedAt)`, `activeSec: round(activeMs/1000)`, `status: 'completed' | 'partial' | 'abandoned'` (abandoned when no step is `done`), `items` = results `{type, refId, name, status, seconds, startBpm, endBpm, rating}`.
  - `countsForStreak(log) → boolean` (true when at least one exercise/fill/song item is `done` or `partial`).
- [ ] **Step 1: Write the failing tests:**
  - full run of a 3-step plan → summary with 3 `done` results and `activeSec` equal to the ticked time;
  - `PAUSE on hidden keeps remaining time`: TICK 10 s, PAUSE, TICK +60 s, RESUME, TICK +5 s → `stepActiveMs === 15000`;
  - NEXT at 2 s → `skipped`; NEXT at 8 s → `partial`;
  - BACK at 4 s restarts; BACK at 1 s returns to the previous step and removes its result;
  - skipping every step → `buildLog(...).status === 'abandoned'` and `countsForStreak` false;
  - EXIT mid-session → summary with the finished results and status `'partial'`;
  - rating flow: STEP_TIME_UP → phase `'rate'`; `RATE {rating:'clean'}` → result has `rating:'clean'` and the BPMs.
- [ ] **Step 2:** Run → FAIL. Implement. Run → PASS.
- [ ] **Step 3: Commit** `feat(practice): guided session state machine and log builder` and push.

### Task 12: Media storage and image compression

**Files:** Create `src/lib/media/mediaStore.js`, `src/lib/media/image.js`, tests `mediaStore.test.js` (imports `fake-indexeddb/auto`), `image.test.js`

**Interfaces:**
- Produces:
  - `putMedia(id, blob, meta: {mime, kind:'image'|'audio'|'video', name?}) → Promise<void>`, `getMedia(id) → Promise<{blob, meta}|null>`, `deleteMedia(id)`, `listMediaIds() → Promise<string[]>`, `useObjectUrl`-ready helper `objectUrlFor(id) → Promise<string|null>` (caller revokes).
  - `fitWithin(w, h, max) → {w, h}` (keeps ratio, never upscales).
  - `compressImage(file: Blob, {maxSide = 1600, quality = 0.82}) → Promise<Blob>` (canvas/`createImageBitmap`; JPEG; if the result is still > 1 MB, retry at quality 0.7 then 0.6).
- [ ] **Step 1: Write the failing tests:** put/get roundtrip returns the same bytes and meta; delete then get → null; `listMediaIds` lists ids; `fitWithin(4000, 3000, 1600)` → `{w:1600, h:1200}`; `fitWithin(800, 600, 1600)` → unchanged.
- [ ] **Step 2:** Run → FAIL. Implement (store name `dp-media`, via `idb-keyval` `createStore('dp-media','blobs')`). Run → PASS. (`compressImage` is verified in the browser in Plan 2.)
- [ ] **Step 3: Commit** `feat(media): IndexedDB media store and image sizing` and push.

### Task 13: Supabase sync — tables, codes, API and engine

**Files:**
- Create: `supabase/migrations/20261121_drum_sync.sql`, `src/lib/sync/config.js`, `src/lib/sync/syncCode.js`, `src/lib/sync/api.js`, `src/lib/sync/syncEngine.js`, tests `syncCode.test.js`, `api.test.js`, `syncEngine.test.js`

**Interfaces:**
- Consumes: `createStore` API (`takeDirty`, `markDirty`, `applyRemote`, `get`) from Task 4; `getMedia` from Task 12.
- Produces:
  - `config.js`: `SUPABASE_URL = 'https://rxszreoapfyprmbmjvio.supabase.co'`, `SUPABASE_KEY = 'sb_publishable_yYCpTZTfLepc-PgJYTFkCQ_EzpLGGwU'`.
  - `generateCode(rng?) → 'XXXX-XXXX-XXXX-XXXX'` (alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`); `normalizeCode(input) → string|null` (uppercase, strip spaces/dashes, map I/L→1 and O→0, require exactly 16 valid chars, return grouped form); `hashCode(code) → Promise<string>` (SHA-256 hex of the normalized code without dashes).
  - `createApi({ url, key, code, fetchImpl = fetch })` → `{ pullItems(sinceRev) → rows[], pushItems(rows), pullMedia(ids) → rows[], pushMedia(row), deleteMedia(id) }` — headers `apikey: key`, `x-drum-key: <code without dashes>`; upserts `POST /rest/v1/drum_items?on_conflict=key_hash,kind,id` with `Prefer: resolution=merge-duplicates,return=minimal`; pull `GET /rest/v1/drum_items?select=kind,id,data,updated_at,deleted,rev&rev=gt.<n>&order=rev.asc&limit=1000`; throws `SyncError {offline|auth|server}`.
  - `createSyncEngine({ store, apiFactory = createApi, storage = localStorage, now = Date.now, setTimer = setTimeout })` → `{ enable() → Promise<code>, join(input) → Promise<void>, disable(), syncNow() → Promise<void>, getStatus(), subscribe(fn) }`; status `{ state:'off'|'idle'|'syncing'|'offline'|'error', code, lastSyncAt, pending }`; persisted in `dp-v4-sync` (`{code, keyHash, lastRev}`); push debounced 1.5 s after `store` changes, batches of 200; pull uses `rev > lastRev − 50`; runs on start, on `visibilitychange` to visible, every 5 min while visible, and after a push.
- [ ] **Step 1: Write the SQL file** = the approved script from the spec §8 (tables `drum_items`/`drum_media`, `drum_private.request_key_hash()`, LWW + rev triggers with caps, RLS policies `drum_items_by_key`/`drum_media_by_key`, grants limited to select/insert/update/delete).
- [ ] **Step 2: Apply it** to project `rxszreoapfyprmbmjvio` with the Supabase MCP `apply_migration` (name `drum_sync`). Run `get_advisors` (security + performance): expect no finding that names a `drum_` object.
- [ ] **Step 3: Verify RLS with curl** (code `TEST-CODE-0000-0001`, its SHA-256 as key_hash):
  - POST a row with the header and matching key_hash → 201;
  - GET without `x-drum-key` → `[]`; GET with another valid-length code → `[]`; GET with the right code → the row;
  - POST a row whose key_hash does not match the header → 403/401 (RLS violation);
  - POST the same id with an older `updated_at` → the stored row keeps the newer data;
  - DELETE the test row with the right code → 204; confirm the table is empty for that key.
- [ ] **Step 4: Write the failing tests:** `generateCode` matches `/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/`; `normalizeCode('abcd efgh-jkmn pqrs')` → `'ABCD-EFGH-JKMN-PQRS'`; `normalizeCode('ilo0...')` maps I/L/O; too short → null; `hashCode('0000-0000-0000-0000')` equals the SHA-256 hex of `'0000000000000000'`; api: correct URL, headers and body for push and pull (mock fetch), network failure → `SyncError` type `'offline'`; engine: `enable` pushes every entity once; `join` pulls, `applyRemote` called with the rows, `lastRev` saved; `offline push keeps dirty and reports offline` (api throws offline → `status.state === 'offline'`, `pending > 0`, a retry is scheduled); a remote row newer than local replaces it; `disable` clears `dp-v4-sync` but keeps the store.
- [ ] **Step 5:** Run → FAIL. Implement `syncCode.js`, `api.js`, `syncEngine.js`. Run → PASS. `npx eslint src/lib` clean.
- [ ] **Step 6: Commit** `feat(sync): drum_ tables in ipuc-trinidad and sync client` (include the SQL file) and push.

### Task 14: Foundation verification

**Files:** none new (fixes only).

- [ ] **Step 1:** `npm test` → all suites pass; paste the summary line.
- [ ] **Step 2:** `npx eslint src/lib src/audio` → 0 problems.
- [ ] **Step 3:** `npm run build` → succeeds (the existing UI still builds and deploys unchanged).
- [ ] **Step 4:** Browser smoke check of the engine (Plan 2 wires the UI; here a scratch page is enough): in the dev server console, `const { MetronomeEngine } = await import('/src/audio/engine.js'); const e = new MetronomeEngine(); await e.start({...(await import('/src/audio/planner.js')).defaultMetroConfig(), bpm: 120})` → `e.getSnapshot().playing === true` and pulses advance; `e.stop()` → `playing === false`.
- [ ] **Step 5:** Request a code review of the whole foundation diff (superpowers:requesting-code-review), fix findings, commit `fix: foundation review findings` and push.
