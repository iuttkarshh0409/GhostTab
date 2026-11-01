# GhostTab

A minimal, distraction-free productivity app that helps you preserve your working
context and resume interrupted tasks without having to remember where you left
off. Sessions hold a title, description, progress, blockers, and next action,
and track focused time accurately.

![stack](https://img.shields.io/badge/React-18-61dafb) ![stack](https://img.shields.io/badge/TypeScript-5-3178c6) ![stack](https://img.shields.io/badge/Vite-5-646cff) ![stack](https://img.shields.io/badge/IndexedDB-via%20idb-000)

---

## Features

- **Sessions** — create, edit, and delete work sessions (title, description, progress, blockers, next action).
- **Three states** — `ACTIVE`, `PAUSED`, `COMPLETED`.
- **Strict single-active rule** — only one session can be `ACTIVE` at a time; activating another automatically pauses the current one.
- **Accurate time tracking** — elapsed time is computed from wall-clock timestamps, not from the UI ticker.
- **Persistence** — every session lives in IndexedDB and survives page refreshes and browser restarts.
- **Dashboard** — shows active work, previous sessions, and total focused time.
- **Resume** — one click re-activates a paused session.
- **Validation & error handling** — forms validate input; DB/state errors surface as a toast and never corrupt app state.
- **Minimalist dark UI** — subtle animations, clean typography, generous spacing.

---

## Setup & running

Prerequisites: Node.js ≥ 20 and npm.

```bash
npm install
npm run dev      # dev server -> http://localhost:5173
npm run build    # type-check + production build
npm test         # run the Vitest test suite
npm run coverage # run tests with coverage report
```

---

## Analytics (Round 2)

An analytics module (`src/analytics/`) derives productivity insights purely from
session records. It is reachable via the **Analytics** toggle in the header.

**Productivity overview** — total focused time, sessions created, completed,
paused, average session duration, longest session.

**Weekly activity** — a clean 7-day chart (dependency-free SVG) of focused time,
including zero-activity days, the most productive day, and the daily average.
The chart always reflects the trailing 7 local days, built from **calendar-day
midnights** (DST-safe — 23h/25h days resolve to the correct local date). An
ACTIVE session's in-progress focused time is included, attributed to the days it
spans, so overview and weekly totals stay consistent.

**Session intelligence** — longest completed session, completion rate, sessions
paused 2+ times, and a recent-activity list (by `updatedAt`).

**Date filtering** — `Last 7 days` / `Last 30 days` / `All time`. The selected
range scopes the overview and intelligence metrics using each session's
`createdAt` (local calendar-day window). The weekly chart is always the trailing
7 days; the range does not change the chart's shape. `All time` includes every
session.

**How per-day data is produced:** when a session settles (pause/complete), the
elapsed window is split across local calendar days into a `focusedByDay` map on
the session (`src/time.ts` → `settleActiveWindow` / `splitAcrossDays`). A session
spanning midnight contributes to both days. `pauseCount` is incremented on every
ACTIVE → PAUSED transition (including auto-pause).

**Legacy caveat (honest boundary):** sessions created before this enhancement
have no `focusedByDay` / `pauseCount`. They still count toward totals, averages,
and completion rate, but their past focus is **not** attributed to specific days
and their pause count is unknown. The analytics UI states this explicitly. We do
not fabricate historical day/pause data the prior schema cannot provide.

### Migration & data integrity (v1 → v2)

The IndexedDB database is versioned (`ghosttab`, version 2). On startup,
`ensureAnalyticsMigration()` (`src/db.ts`) runs a **versioned, idempotent,
non-destructive** migration in a **single `readwrite` transaction over
`sessions` + `meta`**:

- It stamps a per-record `analyticsVersion: 2` marker on every session without
  changing `totalFocusedMs`, `focusedByDay` or `pauseCount` — existing totals are
  preserved exactly and nothing is fabricated.
- Legacy records (lacking `focusedByDay`/`pauseCount`) keep those fields absent;
  their absence (under the v2 marker) *is* the explicit signal that daily/pause
  history is unknown.
- It writes `meta.migration = { analyticsVersion: 2, appliedAt }` in the **same
  transaction** as the sweep. This is atomic: either every record gets its marker
  *and* the flag is set, or (on interruption) neither is — so a retry is always
  safe and a "partially migrated" state cannot be observed. It never overwrites
  an equal-or-newer stamp, and new sessions are created with the marker already
  set.

**Representation of values (three-way distinction):**

| Value | Meaning |
|-------|---------|
| `focusedByDay` / `pauseCount` absent | **Unknown** historical value (legacy) — not shown as zero. |
| `focusedByDay: {}` / `pauseCount: 0` | **Known zero** (session is tracked; nothing recorded yet). |
| populated `focusedByDay` / `pauseCount: n` | **Tracked value** (real recorded data). |

Analytics surfaces these distinctly: legacy counts and unattributed lifetime
totals are shown (never invented as daily bars), and pause-multiplicity shows
"unavailable" when no tracked sessions exist or a "partial" note when some
records lack pause data.

---

## Data model (IndexedDB schema)

| Store | Key | Index | Value |
|-------|-----|-------|-------|
| `sessions` | `id` (auto-increment) | `by-state` on `state` | `Session` |
| `meta` | `'meta'` | — | `Meta` |

```ts
interface Session {
  id: number;             // primary key (auto-increment)
  title: string;
  description: string;
  progress: string;
  blockers: string;
  nextAction: string;
  state: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  createdAt: number;      // ms epoch
  updatedAt: number;      // ms epoch
  totalFocusedMs: number; // accumulated focused time from completed windows
  activeStartedAt: number | null; // wall-clock ms when it last became ACTIVE
  focusedByDay?: Record<string, number>; // v2: focused ms per local day (YYYY-MM-DD)
  pauseCount?: number; // v2: number of ACTIVE -> PAUSED transitions
}

interface Meta {
  lastActiveSessionId: number | null;
  rev: number; // optimistic-concurrency counter, bumped on every transition
}
```

---

## Architecture

The design has one governing principle: **IndexedDB is the single source of
truth.** React state is a read-only mirror that is updated *only after* a
database transaction commits. There is no second source of truth for the active
session.

```
src/
  db.ts            # idb wrapper + atomic transition functions (the only writers)
  time.ts          # pure time math: elapsedSince, currentFocusedMs, settleActiveWindow
  sessionStore.tsx # SessionProvider: in-process mutation queue + cache mirror
  hooks/useTimer.ts# 1s tick that only re-renders; never writes time
  components/      # Dashboard, SessionCard, SessionForm
  validation.ts    # input validation
```

### Time tracking

- `activeStartedAt` is a wall-clock timestamp written when a session becomes `ACTIVE`.
- `totalFocusedMs` accumulates **only when a session leaves the ACTIVE state**
  (pause or complete), by adding the actual elapsed wall-clock delta:

  ```
  onPauseOrComplete(session, now):
      session.totalFocusedMs += max(0, now - session.activeStartedAt)
      session.state = PAUSED | COMPLETED
      session.activeStartedAt = null
  ```

- The current focused time at any instant is *derived*:

  ```
  currentFocusedMs = session.totalFocusedMs
                     + (state === ACTIVE ? max(0, now - activeStartedAt) : 0)
  ```

- The UI badge refreshes every second (`useTimer`) but **only re-reads this
  derived value**; it never writes to the database. It is not the source of truth.

### Single-active-session invariant

Guaranteed by the database layer, in two cooperating ways:

1. **In-process mutation queue** (`sessionStore.tsx`) — every mutation is
   promise-chained so rapid clicks cannot interleave read-modify-write cycles.
2. **Atomic IndexedDB transaction** (`db.ts`) — each transition runs in a
   single `readwrite` transaction over `sessions` + `meta` that (a) reads any
   current `ACTIVE` row, (b) settles it to `PAUSED`, (c) activates the target,
   and (d) bumps `meta.rev`. IndexedDB serializes overlapping readwrite
   transactions, so the invariant holds even across tabs.

React state is updated only after the transaction commits; on failure an error
toast is shown and the mirror is left untouched.

### Recovery (close / crash / sleep / reload)

Because `activeStartedAt` persists in IndexedDB:

- **Reload / restart** — the app reads all sessions; an `ACTIVE` row reappears
  active, and the gap since `activeStartedAt` is accounted for by the derived
  elapsed-time formula. No manual fix-up is needed.
- **Crash / force-close** — same as reload; the ACTIVE row survives.
- **Sleep** — `Date.now()` advances through sleep, so the delta includes sleep
  time. This is a deliberate, documented policy: to avoid counting idle time,
  use **Pause** before stepping away.
- **Clock changes** — every delta is `max(0, now - activeStartedAt)`, so a
  backward clock jump cannot corrupt totals.

### Testing

- **Vitest + React Testing Library** (native Vite integration).
- `tests/time.test.ts` — time math (accumulation, clamping, no-ops).
- `tests/db.test.ts` — atomic transitions against `fake-indexeddb`, including
  single-active enforcement under concurrent activation and reload recovery.
- `tests/ui.test.tsx` — component integration: create, validation, single-active
  across the UI, resume, complete, analytics panel.
- `tests/analytics.test.ts` — daily/weekly aggregation, zero-activity days,
  average duration, completion rate, date-range filtering, crossing midnight,
  empty datasets, active sessions, invalid timestamps, DST-safe week keys,
  active-session overview↔weekly consistency.
- `tests/dst.test.ts` — asserts DST transitions (23h/25h days) are handled and
  that weekly day keys stay on consecutive local midnights.
- `tests/migration.test.ts` — versioned migration: v1/legacy records preserved
  with exact totals, missing/partial fields, idempotency, interrupted-retry,
  and zero-vs-unknown distinction.
- `tests/reliability.test.tsx` — fault injection & invariants: single-ACTIVE
  under concurrent activation, completed-session activation guard, delete-while-
  active, backward/forward clock, malformed records, rapid queued transitions,
  failed-mutation mirror realignment, migration retry, cross-tab sync, the
  Round 4 stale-ACTIVE cross-tab reproduction, timer hygiene (no per-second
  analytics tick when idle), and focus/visibility churn.
- `tests/benchmark.test.ts` — recorded timing of analytics computations at
  1k/10k sessions and very large date ranges (not assertions; see Round 5).

**Coverage (actual):** 94.8% statements / 98.1% lines / 78.6% branches / 91.7%
functions (v8 provider, recorded under Vitest 5).

---

## Engineering audit (Round 5)

- **Dependency security:** upgraded the dev toolchain (`vite@7` + `vitest@5`
  + `@vitejs/plugin-react` + `@vitest/coverage-v8@5`). `npm audit` now reports
  **0 vulnerabilities** (previously 10, incl. 3 critical in dev-only `tinypool`/
  `@vitest/mocker`). Runtime deps (`idb`, `react`, `react-dom`) had none.
- **Runtime security:** no `dangerouslySetInnerHTML`, `eval`, `localStorage`/
  `sessionStorage`/cookies, or dynamic URL handling; user content is rendered
  via React (auto-escaped). Data lives in unencrypted IndexedDB (expected for a
  local-first app; flagged as INFORMATIONAL).
- **Performance:** analytics are only recomputed on a 1s cosmetic clock when a
  session is ACTIVE (previously always). Recorded analytics costs at 10k
  sessions: overview ~5–24ms, weekly ~14–21ms, intelligence ~4–15ms (single
  computations).
- **Stress:** covered by `tests/reliability.test.tsx` (rapid transitions,
  delete-while-active including concurrent removal, 50× focus/visibility churn,
  cross-tab missed-broadcast self-healing).

---

## Reliability & invariants (Round 3)

- **Single-ACTIVE invariant** guaranteed by atomic IDB `readwrite` transitions;
  concurrent activation across connections collapses to exactly one ACTIVE.
- **Completed sessions cannot be activated** — `setSessionActive` rejects with
  `Cannot activate a completed session` (guard at the data layer, not just UI).
- **Failed mutations never leave misleading UI** — `runMutation` realigns the
  mirror to the authoritative DB on error while surfacing an error toast.
- **Cross-tab sync** — a guarded `BroadcastChannel` broadcasts after each
  successful mutation; other tabs re-read the DB. Environments without
  BroadcastChannel (e.g. jsdom) degrade gracefully. Real multi-window UI sync
  is simulated by a two-instance test with a mocked channel.
- **Self-healing reconciliation** — if a cross-tab broadcast is missed (e.g.
  backgrounded/throttled tab, lost delivery, torn-down listener), the tab
  re-reads the authoritative DB on `focus`/`visibilitychange`, so a stale
  ACTIVE display self-corrects instead of requiring a manual refresh. This is
  the Round 4 fix for the intermittent "different ACTIVE per tab" report.
- **Time integrity** — backward clock jumps are clamped (`clampNonNegative`,
  `splitAcrossDays` end≤start) so focused time never goes negative; large
  forward jumps are bounded and terminate.

**Untested / lightly tested areas:**
- `main.tsx` and the DOM bootstrap are not covered (entry-point glue).
- `types.ts` is types only (no runtime statements).
- The browser visual design and real browser persistence were verified manually
  (Chromium) rather than in the unit suite.
- Multi-tab true concurrency is unit-tested against `fake-indexeddb`; a real
  two-tab E2E run is not automated here.
- `validation.ts` max-length branches are partially covered; empty-title is covered.
- `ActivityChart` SVG styling/tooltip branches are lightly covered (render tests); the chart's
  visual rendering was verified in the browser.
- Per-day attribution and pause counts are unit-tested; their browser behavior on the local
  IndexedDB follows the same code path.

---

## Decisions & rationale

| Decision | Rationale |
|----------|-----------|
| IndexedDB via `idb` | Zero-server, offline, survives restarts; ~1 KB; structured queries/indexes. |
| DB-authoritative state | Eliminates dual-source-of-truth bugs and makes transitions atomic. |
| Wall-clock `activeStartedAt` | Accurate even if the UI tab is throttled or closed; UI ticker is cosmetic. |
| Atomic transactions + queue | Single-ACTIVE invariant holds under rapid and concurrent activation. |
| `meta.rev` counter | Optimistic-concurrency signal for cross-tab transitions. |
| React Context + `useReducer` | No external state library needed; state is a thin mirror. |
| Vitest + RTL | First-class Vite integration; no Jest config drift. |

---

## Desktop (Tauri 2) — Round 6

The web app is being evolved (not rewritten) into a native Windows desktop app
with Tauri 2. The React/Vite/IndexedDB layer is kept as-is and runs inside the
Tauri WebView (WebView2).

### Architecture
- **Frontend (unchanged):** React app in `src/`, built by Vite → `dist/`.
  IndexedDB (`ghosttab`) remains the single source of truth.
- **Shell (`src-tauri/`):** Rust provides the native window, system tray,
  single-instance enforcement, hide-to-tray, and graceful exit.
- **Bridge (`src/desktop/`):** `bridge.ts` (guarded Tauri IPC), `trayActions.ts`
  (pure decision logic), `DesktopBridge.tsx` (wires tray events into the store).

### Single session-management authority
The Rust shell **never reads or modifies session records**. Tray Pause/Resume
only emits a `tray-menu` event; `DesktopBridge` resolves it against the current
store state (`trayDecision`) and calls the existing `actions.pause/activate`.
This keeps one source of truth (the frontend session store).

### Lifecycle semantics
- **Hide-to-tray:** closing the window hides it (WebView stays alive) so an
  ACTIVE session keeps accumulating.
- **Exit:** tray **Exit** (or app quit) sets an `EXITING` flag and terminates.
- **OS shutdown / restart recovery:** sessions are DB-authoritative; an ACTIVE
  session's `activeStartedAt` persists, so after restart the elapsed time is
  reconstructed from it — no duplicate timers or sessions are created.

### Persistence / migration
- IndexedDB persistence is **not assumed** to transfer automatically. It lives
  in the WebView user-data directory derived from the app `identifier`
  (`com.ghosttab.app`), which is frozen so an existing install keeps its data.
- **Export/import fallback is planned** for transferring data from a browser
  profile to the desktop app; it is NOT implemented yet and will never
  overwrite existing user data.
- The existing versioned migration (`ensureAnalyticsMigration`) runs unchanged on
  first desktop launch, so legacy sessions/totals and "unknown analytics"
  classification carry over.

### Status & verification honesty
- **Current status:** GhostTab **1.0.0** desktop application is built and
  verified. The production NSIS installer (`.exe`) is produced successfully
  (`npm run tauri:build`), and the native app — window creation, system tray,
  single-instance enforcement, hide-to-tray, and session timing while minimized —
  has been verified interactively on Windows.
- The web application and its automated suite remain green (92 tests passing).

### Prerequisites (exact, verified)
- **Node.js ≥ 18** and npm (installed; packages present).
- **Rust toolchain** — installed (`rustc`/`cargo` 1.99.1, host
  `x86_64-pc-windows-msvc`).
- **Microsoft C++ Build Tools with the C++ workload** — installed. The VC++
  toolset (`cl.exe`/`link.exe`), `vcvars64.bat`, and the Windows SDK `Lib/`
  tree are present, so `cargo build` links successfully.
- **WebView2 Runtime** — ships with Windows 11 / recent Windows 10.
- **Icons** — generated into `src-tauri/icons/` (verified present).

### Build steps
1. From the project root, generate icons from a square source image:
   `npm run tauri:icon icon-source.png`
2. Development run: `npm run tauri:dev` (frontend Vite + Rust shell).
3. Production Windows installer: `npm run tauri:build` — emits an NSIS
   installer `.exe` under `src-tauri/target/release/bundle/nsis/`.

The native dev build compiles and launches (`npm run tauri:dev`). Icon assets,
native build, window creation, and single-instance enforcement are exercised;
functional tray/window behaviours have been confirmed by interactive Windows
verification (see below).

### Native verification tools
The scripts under `tools/` support reproducible native Windows verification and
are intentionally **not** part of the Vitest suite: they require a live native
Tauri process and a real Windows desktop (jsdom/CI cannot launch the WebView2
binary or a system tray). Run them from the project root after launching the
app:

- `node tools/probe-native-window.cjs` — confirms the `ghosttab` native window
  exists and prints its handle.
- `node tools/probe-process-count.cjs` — asserts exactly one `ghosttab` process
  is running (no orphans/duplicates).
- `node tools/probe-single-instance.cjs <path-to-ghosttab.exe>` — launches a
  second instance of the binary and asserts it exits while the first remains
  (single-instance enforcement). Example (dev build):
  `node tools/probe-single-instance.cjs %USERPROFILE%\ghosttab-target\debug\ghosttab.exe`
- `node tools/sleep.cjs <seconds>` — wait helper used by the probes.

The tray menu (Open / Pause-Resume / Exit), close-to-tray hiding, and session
timing while minimized are verified interactively (Window UI + tray), outside
the automated suite.

### Known limitations (desktop)
- System-tray/window/single-instance *functional* behaviour requires interactive
  Windows verification; automated probes cover window existence and process
  single-instance enforcement.
- OS shutdown (`WM_QUERYENDSESSION`) is not distinguished from close; session
  recovery after restart is still safe because state is DB-authoritative.

---

## License

MIT
