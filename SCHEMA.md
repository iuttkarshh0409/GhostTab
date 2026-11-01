# GhostTab — Database Schema

Persistence is provided by a single IndexedDB database named `ghosttab`
(version 1), opened via the `idb` wrapper.

## Stores

### `sessions`

Object store with `keyPath: 'id'` and `autoIncrement: true`.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `number` | Primary key, auto-incremented. |
| `title` | `string` | Required; ≤ 80 chars. |
| `description` | `string` | Free text; ≤ 500 chars. |
| `progress` | `string` | Free text; ≤ 1000 chars. |
| `blockers` | `string` | Free text; ≤ 1000 chars. |
| `nextAction` | `string` | Free text; ≤ 500 chars. |
| `state` | `'ACTIVE' | 'PAUSED' | 'COMPLETED'` | Session lifecycle state. |
| `createdAt` | `number` | `Date.now()` at creation. |
| `updatedAt` | `number` | `Date.now()` at last mutation. |
| `totalFocusedMs` | `number` | Accumulated focused millis (settled windows). |
| `activeStartedAt` | `number | null` | Wall-clock ms when it became ACTIVE; `null` otherwise. |

**Index:** `by-state` on `state` — used to locate the current ACTIVE session
inside atomic transitions.

### `meta`

Single-record store (fixed key `'meta'`).

| Field | Type | Notes |
|-------|------|-------|
| `lastActiveSessionId` | `number | null` | The single ACTIVE session, if any. |
| `rev` | `number` | Monotonic transition counter for optimistic concurrency. |

## Transition contract (atomic)

Every state change is a single `readwrite` transaction over `sessions` +
`meta`:

| Operation | Behaviour |
|-----------|-----------|
| `create` | Add a `PAUSED` session with `totalFocusedMs = 0`, `activeStartedAt = null`. |
| `activate` / `resume` | Settle any existing ACTIVE session to `PAUSED` (accumulate elapsed), set target `ACTIVE` with `activeStartedAt = now`, set `meta.lastActiveSessionId = target`, bump `rev`. |
| `pause` | If active, accumulate elapsed into `totalFocusedMs`, set `activeStartedAt = null`, set state `PAUSED`, clear `meta` if it pointed here, bump `rev`. |
| `complete` | Same settlement as pause, state `COMPLETED`, clear `meta`, bump `rev`. |
| `delete` | Remove the record; if it was ACTIVE, clear `meta`, bump `rev`. |

## Invariants

1. At most one row has `state = 'ACTIVE'`.
2. `meta.lastActiveSessionId` equals the id of the ACTIVE row (or `null`).
3. `activeStartedAt !== null` ⟺ `state = 'ACTIVE'`.
4. `totalFocusedMs` only ever increases during ACTIVE → PAUSED/COMPLETED transitions.
