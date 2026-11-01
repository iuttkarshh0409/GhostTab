import type { Session } from '../types';
import { dayStart, dateKey, splitAcrossDays, currentFocusedMs } from '../time';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnalyticsRange = '7d' | '30d' | 'all';

export interface Overview {
  totalFocusedMs: number;
  totalSessions: number;
  completed: number;
  paused: number;
  active: number;
  avgDurationMs: number;
  longestMs: number;
  /** Sessions with complete analytics tracking (have focusedByDay/pauseCount). */
  trackedSessions: number;
  /** Sessions predating analytics tracking (daily/pause history unknown). */
  legacySessions: number;
}

export interface DayActivity {
  key: string; // YYYY-MM-DD (local)
  ms: number;
}

export interface Weekly {
  days: DayActivity[]; // exactly 7, trailing days ending today, includes zeros
  totalMs: number;
  dailyAverageMs: number;
  mostProductiveDay: string | null;
  /** True if any session lacks per-day record, so the chart is incomplete. */
  hasLegacy: boolean;
  legacySessions: number;
  /** Known lifetime focused ms of legacy sessions NOT representable in the chart. */
  unattributedMs: number;
}

export interface Intelligence {
  longestCompletedMs: number | null;
  longestCompletedTitle: string | null;
  completionRate: number; // 0..100
  multiPaused: Session[]; // pauseCount > 1 (tracked only)
  /** Sessions in scope that have a real pauseCount (tracked). */
  withPauseData: number;
  /** Sessions in scope whose pause count is unknown (legacy). */
  withoutPauseData: number;
  recent: Session[]; // by updatedAt desc, top 5
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const isValidTimestamp = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const DAYS = { '7d': 7, '30d': 30 } as const;

/**
 * Local midnight of the day `daysBack` calendar days before `referenceStart`
 * (which must itself be a local midnight). Uses Date normalization
 * (new Date(y, m, d - daysBack)) so DST days (23/25h) resolve to the correct
 * local date instead of drifting by a fixed 24h step.
 */
const calendarMidnightDaysBefore = (referenceStart: number, daysBack: number): number => {
  const d = new Date(referenceStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysBack).getTime();
};

/** Inclusive lower bound (local calendar days) for a range. */
const rangeStart = (range: AnalyticsRange, now: number): number => {
  if (range === 'all') return Number.NEGATIVE_INFINITY;
  const n = DAYS[range];
  return calendarMidnightDaysBefore(dayStart(now), n - 1);
};

const scopedByRange = (sessions: Session[], range: AnalyticsRange, now: number): Session[] => {
  const start = rangeStart(range, now);
  return sessions.filter((s) => isValidTimestamp(s.createdAt) && s.createdAt >= start);
};

/** True if a session predates analytics tracking (daily/pause history unknown). */
const isLegacy = (s: Session): boolean =>
  s.focusedByDay === undefined && s.pauseCount === undefined;

// ---------------------------------------------------------------------------
// A. Productivity overview
// ---------------------------------------------------------------------------

export const computeOverview = (
  sessions: Session[],
  range: AnalyticsRange,
  now: number,
): Overview => {
  const scoped = scopedByRange(sessions, range, now);

  let totalFocusedMs = 0;
  let completed = 0;
  let paused = 0;
  let active = 0;
  let sumSettled = 0;
  let tracked = 0;
  let legacy = 0;

  for (const s of scoped) {
    totalFocusedMs += currentFocusedMs(s, now);
    if (s.state === 'COMPLETED') completed += 1;
    else if (s.state === 'PAUSED') paused += 1;
    else active += 1;
    sumSettled += isValidTimestamp(s.totalFocusedMs) ? s.totalFocusedMs : 0;
    if (isLegacy(s)) legacy += 1;
    else tracked += 1;
  }

  const longestMs = scoped.reduce(
    (max, s) => Math.max(max, isValidTimestamp(s.totalFocusedMs) ? s.totalFocusedMs : 0),
    0,
  );

  return {
    totalFocusedMs,
    totalSessions: scoped.length,
    completed,
    paused,
    active,
    avgDurationMs: scoped.length > 0 ? sumSettled / scoped.length : 0,
    longestMs,
    trackedSessions: tracked,
    legacySessions: legacy,
  };
};

// ---------------------------------------------------------------------------
// B. Weekly activity (trailing 7 days)
// ---------------------------------------------------------------------------

export const computeWeekly = (sessions: Session[], now: number): Weekly => {
  const todayStart = dayStart(now);
  const dayStarts = Array.from({ length: 7 }, (_, i) =>
    calendarMidnightDaysBefore(todayStart, 6 - i),
  );
  const dayKeys = dayStarts.map(dateKey);

  const buckets: Record<string, number> = {};
  const add = (key: string, ms: number) => {
    if (ms > 0) buckets[key] = (buckets[key] ?? 0) + ms;
  };

  let legacySessions = 0;
  let unattributedMs = 0;

  for (const s of sessions) {
    // Legacy sessions have no per-day record: we cannot place their known
    // lifetime focused time on any day, so we track it separately and mark it
    // as unattributed rather than silently treating it as zero.
    if (s.focusedByDay === undefined) {
      legacySessions += 1;
      if (isValidTimestamp(s.totalFocusedMs)) unattributedMs += s.totalFocusedMs;
    }

    const settled = s.focusedByDay ?? {};
    for (const [key, ms] of Object.entries(settled)) {
      add(key, ms);
    }
    // Active sessions contribute their in-progress focused time too — the same
    // value `computeOverview` includes via currentFocusedMs — attributed across
    // the calendar days the window spans, so overview and weekly totals agree.
    if (s.state === 'ACTIVE' && isValidTimestamp(s.activeStartedAt)) {
      const live = splitAcrossDays(s.activeStartedAt, now);
      for (const [key, ms] of Object.entries(live)) add(key, ms);
    }
  }

  const days: DayActivity[] = dayKeys.map((key) => ({ key, ms: buckets[key] ?? 0 }));

  let totalMs = 0;
  let maxMs = 0;
  let mostProductiveDay: string | null = null;
  for (const d of days) {
    totalMs += d.ms;
    if (d.ms > maxMs) {
      maxMs = d.ms;
      mostProductiveDay = d.key;
    }
  }

  return {
    days,
    totalMs,
    dailyAverageMs: totalMs / 7,
    mostProductiveDay,
    hasLegacy: legacySessions > 0,
    legacySessions,
    unattributedMs,
  };
};

// ---------------------------------------------------------------------------
// C. Session intelligence
// ---------------------------------------------------------------------------

export const computeIntelligence = (
  sessions: Session[],
  range: AnalyticsRange,
  now: number,
): Intelligence => {
  const scoped = scopedByRange(sessions, range, now);

  const completed = scoped.filter((s) => s.state === 'COMPLETED');
  const paused = scoped.filter((s) => s.state === 'PAUSED');

  let longestCompletedMs: number | null = null;
  let longestCompletedTitle: string | null = null;
  for (const s of completed) {
    const ms = isValidTimestamp(s.totalFocusedMs) ? s.totalFocusedMs : 0;
    if (longestCompletedMs === null || ms > longestCompletedMs) {
      longestCompletedMs = ms;
      longestCompletedTitle = s.title;
    }
  }

  const closedTotal = completed.length + paused.length;
  const completionRate = closedTotal > 0 ? (completed.length / closedTotal) * 100 : 0;

  // Pause multiplicity is only known for tracked sessions (pauseCount present).
  // Legacy sessions have an unknown count; we never treat them as zero.
  let withPauseData = 0;
  let withoutPauseData = 0;
  const multiPaused: Session[] = [];
  for (const s of scoped) {
    if (typeof s.pauseCount === 'number') {
      withPauseData += 1;
      if (s.pauseCount > 1) multiPaused.push(s);
    } else {
      withoutPauseData += 1;
    }
  }

  const recent = [...scoped]
    .sort((a, b) => (isValidTimestamp(b.updatedAt) ? b.updatedAt : 0) - (isValidTimestamp(a.updatedAt) ? a.updatedAt : 0))
    .slice(0, 5);

  return { longestCompletedMs, longestCompletedTitle, completionRate, multiPaused, withPauseData, withoutPauseData, recent };
};
