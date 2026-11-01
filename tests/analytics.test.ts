import './setup';
import { describe, expect, it } from 'vitest';
import type { Session } from '../src/types';
import { computeIntelligence, computeOverview, computeWeekly } from '../src/analytics';
import { dayStart, dateKey, settleActiveWindow } from '../src/time';

const NOW = new Date(2024, 0, 5, 12, 0, 0).getTime(); // local Jan 5, 2024 noon

const sess = (over: Partial<Session>): Session => ({
  id: 1,
  title: 'T',
  description: '',
  progress: '',
  blockers: '',
  nextAction: '',
  state: 'PAUSED',
  createdAt: NOW - 1000,
  updatedAt: NOW - 1000,
  totalFocusedMs: 0,
  activeStartedAt: null,
  focusedByDay: {},
  pauseCount: 0,
  ...over,
});

describe('computeOverview', () => {
  it('aggregates totals, counts and averages', () => {
    const sessions = [
      sess({ id: 1, state: 'COMPLETED', totalFocusedMs: 3600000 }),
      sess({ id: 2, state: 'COMPLETED', totalFocusedMs: 1800000 }),
      sess({ id: 3, state: 'PAUSED', totalFocusedMs: 600000 }),
    ];
    const o = computeOverview(sessions, 'all', NOW);
    expect(o.totalSessions).toBe(3);
    expect(o.completed).toBe(2);
    expect(o.paused).toBe(1);
    expect(o.active).toBe(0);
    expect(o.totalFocusedMs).toBe(6000000);
    expect(o.avgDurationMs).toBe(2000000);
    expect(o.longestMs).toBe(3600000);
  });

  it('includes the running active window in total focused time', () => {
    const sessions = [sess({ id: 1, state: 'ACTIVE', activeStartedAt: NOW - 60000 })];
    const o = computeOverview(sessions, 'all', NOW);
    expect(o.totalFocusedMs).toBe(60000);
    expect(o.active).toBe(1);
  });

  it('returns zeros for an empty dataset', () => {
    const o = computeOverview([], 'all', NOW);
    expect(o).toEqual({
      totalFocusedMs: 0,
      totalSessions: 0,
      completed: 0,
      paused: 0,
      active: 0,
      avgDurationMs: 0,
      longestMs: 0,
      trackedSessions: 0,
      legacySessions: 0,
    });
  });
});

describe('date-range filtering', () => {
  it('7d includes only sessions created in the last 7 calendar days', () => {
    const within = sess({ id: 1, createdAt: NOW - 2 * 86400000 });
    const outside = sess({ id: 2, createdAt: NOW - 20 * 86400000 });
    const o = computeOverview([within, outside], '7d', NOW);
    expect(o.totalSessions).toBe(1);
  });

  it('30d includes sessions within 30 days and excludes older ones', () => {
    const recent = sess({ id: 1, createdAt: NOW - 10 * 86400000 });
    const older = sess({ id: 2, createdAt: NOW - 45 * 86400000 });
    const o = computeOverview([recent, older], '30d', NOW);
    expect(o.totalSessions).toBe(1);
  });

  it('all time includes everything', () => {
    const old = sess({ id: 1, createdAt: NOW - 1000 * 86400000 });
    expect(computeOverview([old], 'all', NOW).totalSessions).toBe(1);
  });
});

describe('computeWeekly', () => {
  it('produces exactly 7 days including zero-activity days', () => {
    const sessions = [sess({ focusedByDay: { '2024-01-03': 1800000 } })];
    const w = computeWeekly(sessions, NOW);
    expect(w.days).toHaveLength(7);
    const zeroDays = w.days.filter((d) => d.ms === 0);
    expect(zeroDays.length).toBeGreaterThan(0); // days with no activity present
    expect(w.totalMs).toBe(1800000);
    expect(w.dailyAverageMs).toBeCloseTo(1800000 / 7, 5);
    expect(w.mostProductiveDay).toBe('2024-01-03');
  });

  it('aggregates across multiple days', () => {
    const sessions = [
      sess({ focusedByDay: { '2024-01-01': 1000000, '2024-01-02': 2000000 } }),
      sess({ focusedByDay: { '2024-01-02': 500000 } }),
    ];
    const w = computeWeekly(sessions, NOW);
    const day2 = w.days.find((d) => d.key === '2024-01-02');
    expect(day2?.ms).toBe(2500000);
    expect(w.mostProductiveDay).toBe('2024-01-02');
  });

  it('returns all-zero days and null productive day for empty data', () => {
    const w = computeWeekly([], NOW);
    expect(w.days).toHaveLength(7);
    expect(w.totalMs).toBe(0);
    expect(w.mostProductiveDay).toBeNull();
    expect(w.dailyAverageMs).toBe(0);
  });

  it('builds seven consecutive local-midnight days ending today', () => {
    const w = computeWeekly([], NOW);
    expect(w.days).toHaveLength(7);
    const starts = w.days.map((d) => {
      const [y, m, dd] = d.key.split('-').map(Number);
      return new Date(y, m - 1, dd).getTime();
    });
    for (let i = 0; i < 7; i++) {
      expect(starts[i]).toBe(dayStart(starts[i])); // each resolves to a local midnight
      if (i > 0) expect(starts[i]).toBeGreaterThan(starts[i - 1]); // strictly increasing
    }
    expect(starts[6]).toBe(dayStart(NOW)); // ends on today (local)
  });

  it('overview and weekly totals agree for an active session', () => {
    const active = sess({ id: 5, state: 'ACTIVE', activeStartedAt: NOW - 60000 });
    const o = computeOverview([active], 'all', NOW);
    const w = computeWeekly([active], NOW);
    expect(o.totalFocusedMs).toBe(60000);
    const todayBar = w.days.find((d) => d.key === dateKey(NOW));
    expect(todayBar?.ms).toBe(60000);
    expect(w.totalMs).toBe(60000);
  });
});

describe('crossing midnight', () => {
  it('settleActiveWindow attributes a window to both calendar days', () => {
    const start = new Date(2024, 0, 1, 23, 30).getTime(); // Jan 1 23:30 local
    const end = new Date(2024, 0, 2, 0, 30).getTime(); // Jan 2 00:30 local
    const active = sess({ id: 9, state: 'ACTIVE', activeStartedAt: start });
    const settled = settleActiveWindow(active, end);
    expect(settled.totalFocusedMs).toBe(3600000);
    expect(settled.focusedByDay?.['2024-01-01']).toBe(1800000);
    expect(settled.focusedByDay?.['2024-01-02']).toBe(1800000);
  });

  it('merges into existing per-day buckets on a second settlement', () => {
    const start = new Date(2024, 0, 1, 23, 30).getTime();
    const end = new Date(2024, 0, 2, 0, 30).getTime();
    const active = sess({
      id: 9,
      state: 'ACTIVE',
      activeStartedAt: start,
      focusedByDay: { '2024-01-01': 60000 },
    });
    const settled = settleActiveWindow(active, end);
    expect(settled.focusedByDay?.['2024-01-01']).toBe(1860000);
    expect(settled.focusedByDay?.['2024-01-02']).toBe(1800000);
  });
});

describe('computeIntelligence', () => {
  it('computes longest completed, completion rate and multi-paused', () => {
    const sessions = [
      sess({ id: 1, state: 'COMPLETED', title: 'Long', totalFocusedMs: 7200000 }),
      sess({ id: 2, state: 'COMPLETED', title: 'Short', totalFocusedMs: 1200000 }),
      sess({ id: 3, state: 'PAUSED', title: 'P', pauseCount: 3 }),
      sess({ id: 4, state: 'PAUSED', title: 'P2', pauseCount: 1 }),
    ];
    const i = computeIntelligence(sessions, 'all', NOW);
    expect(i.longestCompletedMs).toBe(7200000);
    expect(i.longestCompletedTitle).toBe('Long');
    expect(i.completionRate).toBeCloseTo(50, 5); // 2 of 4 closed
    expect(i.multiPaused.map((s) => s.id)).toEqual([3]);
  });

  it('completion rate is 0 when no closed sessions exist', () => {
    const sessions = [sess({ id: 1, state: 'ACTIVE' })];
    const i = computeIntelligence(sessions, 'all', NOW);
    expect(i.completionRate).toBe(0);
    expect(i.longestCompletedMs).toBeNull();
  });

  it('recent sorts by updatedAt descending', () => {
    const sessions = [
      sess({ id: 1, updatedAt: NOW - 3000 }),
      sess({ id: 2, updatedAt: NOW - 1000 }),
      sess({ id: 3, updatedAt: NOW - 2000 }),
    ];
    const i = computeIntelligence(sessions, 'all', NOW);
    expect(i.recent.map((s) => s.id)).toEqual([2, 3, 1]);
  });
});

describe('invalid or missing timestamps', () => {
  it('excludes sessions with non-finite createdAt from scoped ranges', () => {
    const bad = sess({ id: 1, createdAt: Number.NaN });
    const good = sess({ id: 2, createdAt: NOW - 1000 });
    const o = computeOverview([bad, good], 'all', NOW);
    expect(o.totalSessions).toBe(1);
  });

  it('handles missing focusedByDay / pauseCount defensively', () => {
    const legacy = sess({ id: 1, state: 'COMPLETED', totalFocusedMs: 900000 });
    delete (legacy as { focusedByDay?: unknown }).focusedByDay;
    delete (legacy as { pauseCount?: unknown }).pauseCount;
    const w = computeWeekly([legacy], NOW);
    expect(w.totalMs).toBe(0);
    const i = computeIntelligence([legacy], 'all', NOW);
    expect(i.completionRate).toBe(100);
    expect(i.multiPaused).toHaveLength(0);
  });
});
