import type { Session } from './types';

export const clampNonNegative = (value: number): number => Math.max(0, value);

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Local-timezone calendar day key, e.g. "2024-01-05". */
export const dateKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Start of the local day containing ts (00:00:00.000). */
export const dayStart = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Start of the next local day after the day containing ts. */
export const dayEnd = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
};

export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Split a wall-clock interval [start, end) into per-day buckets by local
 * calendar day. Guaranteed progress (cursor strictly increases), so cross
 * midnight windows are attributed to both days and segments sum to `end-start`.
 */
export const splitAcrossDays = (start: number, end: number): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return out;
  let cursor = start;
  while (cursor < end) {
    const next = Math.min(end, dayEnd(cursor));
    const key = dateKey(cursor);
    out[key] = (out[key] ?? 0) + (next - cursor);
    cursor = next;
  }
  return out;
};

/**
 * Elapsed wall-clock focused time for a session that is currently ACTIVE.
 * Returns 0 for anything not ACTIVE. Purely derived — never mutates.
 */
export const elapsedSince = (session: Session, now: number): number => {
  if (session.state !== 'ACTIVE') return 0;
  if (session.activeStartedAt === null) return 0;
  return clampNonNegative(now - session.activeStartedAt);
};

/**
 * Total focused time at a point in time: accumulated completed windows
 * plus any in-progress active window.
 */
export const currentFocusedMs = (session: Session, now: number): number =>
  session.totalFocusedMs + elapsedSince(session, now);

/**
 * When a session leaves ACTIVE, accumulate its active window into
 * totalFocusedMs and clear the active start. Returns a NEW object.
 */
export const settleActiveWindow = (
  session: Session,
  now: number,
): Session => {
  if (session.state !== 'ACTIVE') return session;
  const start = session.activeStartedAt;
  if (start === null) {
    // No known window start; settle without attributing time.
    return { ...session, activeStartedAt: null, state: 'PAUSED' };
  }
  const elapsed = clampNonNegative(now - start);
  const dayDelta = splitAcrossDays(start, now);
  const focusedByDay = { ...(session.focusedByDay ?? {}) };
  for (const [key, ms] of Object.entries(dayDelta)) {
    focusedByDay[key] = (focusedByDay[key] ?? 0) + ms;
  }
  return {
    ...session,
    totalFocusedMs: session.totalFocusedMs + elapsed,
    focusedByDay,
    activeStartedAt: null,
    state: 'PAUSED',
  };
};

export const formatFocused = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
};
