import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { openDB } from 'idb';
import * as db from '../src/db';
import { settleActiveWindow, splitAcrossDays, elapsedSince } from '../src/time';
import { computeIntelligence, computeOverview, computeWeekly } from '../src/analytics';
import { SessionProvider, useSessions } from '../src/sessionStore';
import { AnalyticsPanel } from '../src/components/analytics/AnalyticsPanel';
import type { Session, SessionInput } from '../src/types';

const NOW = new Date(2024, 0, 5, 12, 0, 0).getTime();
const input = (title: string): SessionInput => ({ title, description: '', progress: '', blockers: '', nextAction: '' });

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
  analyticsVersion: 2,
  ...over,
});

// ---------------------------------------------------------------------------
// Minimal BroadcastChannel mock (jsdom has none) for cross-tab tests.
// ---------------------------------------------------------------------------
class FakeBroadcastChannel {
  static channels: FakeBroadcastChannel[] = [];
  name: string;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  constructor(name: string) {
    this.name = name;
    FakeBroadcastChannel.channels.push(this);
  }
  postMessage(data: unknown) {
    for (const ch of FakeBroadcastChannel.channels) {
      if (ch === this || ch.name !== this.name) continue;
      // Test hook: simulate a tab that misses a broadcast (e.g. throttled or
      // backgrounded, or a delivery that is lost).
      if ((globalThis as { __DROP_ALL_SYNC__?: boolean }).__DROP_ALL_SYNC__) continue;
      setTimeout(() => {
        if (ch.onmessage) ch.onmessage({ data });
      }, 0);
    }
  }
  close() {
    const i = FakeBroadcastChannel.channels.indexOf(this);
    if (i >= 0) FakeBroadcastChannel.channels.splice(i, 1);
  }
}
(globalThis as { BroadcastChannel?: unknown }).BroadcastChannel = FakeBroadcastChannel as unknown as typeof BroadcastChannel;

function Harness({ slot }: { slot: string }) {
  const ctx = useSessions();
  useEffect(() => {
    (globalThis as Record<string, unknown>)[slot] = ctx;
  });
  return null;
}

const mountHarness = (slot: string): HTMLElement => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(
    <SessionProvider>
      <Harness slot={slot} />
    </SessionProvider>,
    { container },
  );
  return container;
};

const ctx = (slot: string) => (globalThis as Record<string, any>)[slot];

const seedLegacy = async (over: Partial<Session> = {}) => {
  const raw = await openDB('ghosttab', 2, {
    upgrade(dbb) {
      if (!dbb.objectStoreNames.contains('sessions')) {
        const s = dbb.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by-state', 'state');
      }
      if (!dbb.objectStoreNames.contains('meta')) dbb.createObjectStore('meta');
    },
  });
  const id = await raw.add('sessions', { title: 'Legacy', description: '', progress: '', blockers: '', nextAction: '', state: 'PAUSED', createdAt: NOW - 1e7, updatedAt: NOW - 1e7, totalFocusedMs: 123456, activeStartedAt: null, ...over });
  raw.close();
  return id as number;
};

beforeEach(async () => {
  FakeBroadcastChannel.channels = [];
  delete (globalThis as Record<string, unknown>).__A;
  delete (globalThis as Record<string, unknown>).__B;
  await db.resetDb();
});

describe('invariants', () => {
  it('never more than one ACTIVE session under concurrent activation', async () => {
    const a = await db.createSession(input('A'));
    const b = await db.createSession(input('B'));
    const c = await db.createSession(input('C'));
    await Promise.all([
      db.setSessionActive(a.id, 1000),
      db.setSessionActive(b.id, 1000),
      db.setSessionActive(c.id, 1000),
    ]);
    const all = await db.getAllSessions();
    const active = all.filter((s) => s.state === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect((await db.getMeta()).lastActiveSessionId).toBe(active[0].id);
  });

  it('completed sessions cannot be activated (root cause F1)', async () => {
    const s = await db.createSession(input('Done'));
    await db.setSessionActive(s.id, 1000);
    await db.completeSession(s.id, 2000);
    await expect(db.setSessionActive(s.id, 3000)).rejects.toThrow(/completed/);
    const after = await db.getSession(s.id);
    expect(after?.state).toBe('COMPLETED');
    expect((await db.getAllSessions()).some((x) => x.state === 'ACTIVE')).toBe(false);
  });

  it('deleting the active session clears the active marker', async () => {
    const s = await db.createSession(input('A'));
    await db.setSessionActive(s.id, 1000);
    await db.deleteSession(s.id);
    expect((await db.getMeta()).lastActiveSessionId).toBeNull();
    const all = await db.getAllSessions();
    expect(all.some((x) => x.state === 'ACTIVE')).toBe(false);
  });

  it('deleting a concurrently-removed ACTIVE session still clears the meta pointer', async () => {
    const s = await db.createSession(input('A'));
    await db.setSessionActive(s.id, 1000);
    expect((await db.getMeta()).lastActiveSessionId).toBe(s.id);
    // Simulate another tab removing the record first, leaving meta stale.
    const raw = await openDB('ghosttab', 2, {});
    const dtx = raw.transaction('sessions', 'readwrite');
    await dtx.objectStore('sessions').delete(s.id);
    await dtx.done;
    raw.close();
    // Our delete finds no record, but must still clear the pointer.
    await db.deleteSession(s.id);
    expect((await db.getMeta()).lastActiveSessionId).toBeNull();
  });

  it('completing a PAUSED session with a stale activeStartedAt adds no phantom time', async () => {
    const created = await db.createSession(input('P'));
    // Craft a PAUSED record that wrongly retains a stale active start.
    const raw = await openDB('ghosttab', 2, {});
    const wtx = raw.transaction('sessions', 'readwrite');
    await wtx.objectStore('sessions').put({
      ...created,
      state: 'PAUSED',
      activeStartedAt: NOW - 5000,
      totalFocusedMs: 1000,
    });
    await wtx.done;
    raw.close();

    const done = await db.completeSession(created.id, NOW);
    expect(done.state).toBe('COMPLETED');
    expect(done.totalFocusedMs).toBe(1000); // unchanged — no +5000 phantom
    expect(done.activeStartedAt).toBeNull(); // stale field cleared
  });

  it('focused time never becomes negative on a backward clock', async () => {
    const active = sess({ id: 7, state: 'ACTIVE', activeStartedAt: 5000, totalFocusedMs: 10000 });
    const settled = settleActiveWindow(active, 2000); // now < start
    expect(settled.totalFocusedMs).toBe(10000); // unchanged, not reduced
    expect(elapsedSince(active, 2000)).toBe(0);
    expect(settled.focusedByDay).toEqual({});
  });

  it('a large forward clock jump is bounded and terminates', async () => {
    const start = new Date(2024, 0, 1).getTime();
    const end = new Date(2025, 0, 1).getTime();
    const split = splitAcrossDays(start, end);
    const sum = Object.values(split).reduce((a, b) => a + b, 0);
    expect(sum).toBe(end - start);
    expect(Object.keys(split).length).toBeGreaterThan(360);
  });
});

describe('fault injection', () => {
  it('rapid queued activate/pause/complete ends consistent', async () => {
    const c1 = mountHarness('__A');
    try {
      const a = await db.createSession(input('A'));
      const b = await db.createSession(input('B'));
      // Fire in rapid succession; the mutation queue serializes them.
      const p1 = ctx('__A').actions.activate(a.id);
      const p2 = ctx('__A').actions.pause(a.id);
      const p3 = ctx('__A').actions.activate(b.id);
      const p4 = ctx('__A').actions.complete(b.id);
      await act(async () => {
        await Promise.all([p1, p2, p3, p4]);
      });

      await waitFor(() => {
        const sessions = ctx('__A').sessions;
        expect(sessions.find((s: Session) => s.id === b.id)?.state).toBe('COMPLETED');
        expect(sessions.filter((s: Session) => s.state === 'ACTIVE')).toHaveLength(0);
        for (const s of sessions) expect(s.totalFocusedMs).toBeGreaterThanOrEqual(0);
      });
    } finally {
      document.body.removeChild(c1);
    }
  });

  it('a failed mutation surfaces an error and realigns the mirror', async () => {
    const c1 = mountHarness('__A');
    try {
      const created = await db.createSession(input('Exists'));
      await waitFor(() => expect(ctx('__A').sessions.length).toBe(1));

      let rejected = false;
      await act(async () => {
        try {
          await ctx('__A').actions.update(99999, input('Ghost'));
        } catch {
          rejected = true;
        }
      });
      expect(rejected).toBe(true);
      await waitFor(() => expect(ctx('__A').error).toMatch(/not found/));
      // Mirror still reflects the authoritative DB (the real session), not a ghost.
      expect(ctx('__A').sessions.length).toBe(1);
      expect(ctx('__A').sessions[0].title).toBe('Exists');
      void created;
    } finally {
      document.body.removeChild(c1);
    }
  });

  it('migration retry is idempotent and never corrupts legacy totals', async () => {
    const legacyId = await seedLegacy();
    await db.ensureAnalyticsMigration();
    let rec = await db.getSession(legacyId);
    expect(rec?.analyticsVersion).toBe(2);
    expect(rec?.totalFocusedMs).toBe(123456);
    // Simulate an interrupted run: drop the meta stamp, then retry.
    const tx = (await db.getMeta()) as { migration?: unknown };
    // open a fresh transaction to clear the stamp
    const raw = await openDB('ghosttab', 2, {});
    const wtx = raw.transaction('meta', 'readwrite');
    const meta = await wtx.objectStore('meta').get('meta');
    delete (meta as { migration?: unknown }).migration;
    await wtx.objectStore('meta').put(meta, 'meta');
    await wtx.done;
    raw.close();
    void tx;

    await db.ensureAnalyticsMigration(); // retry
    rec = await db.getSession(legacyId);
    expect(rec?.analyticsVersion).toBe(2);
    expect(rec?.totalFocusedMs).toBe(123456);
    expect(rec?.focusedByDay).toBeUndefined();
    expect((await db.getMeta()).migration?.analyticsVersion).toBe(2);
  });

  it('malformed/missing fields are handled by analytics without throwing', async () => {
    const malformed = [
      sess({ id: 1, createdAt: Number.NaN, totalFocusedMs: Number.NaN }),
      sess({ id: 2, state: 'ACTIVE', activeStartedAt: NOW - 1000, focusedByDay: undefined as never }),
      sess({ id: 3, state: 'COMPLETED', totalFocusedMs: 5000 }),
    ];
    let o: ReturnType<typeof computeOverview>;
    let w: ReturnType<typeof computeWeekly>;
    let i: ReturnType<typeof computeIntelligence>;
    expect(() => {
      o = computeOverview(malformed, 'all', NOW);
      w = computeWeekly(malformed, NOW);
      i = computeIntelligence(malformed, 'all', NOW);
    }).not.toThrow();
    expect(o!.totalSessions).toBe(2); // NaN createdAt excluded
    expect(w!.totalMs).toBeGreaterThanOrEqual(0);
    expect(i!.completionRate).toBeGreaterThanOrEqual(0);
  });
});

describe('cross-tab synchronization', () => {
  it('a change in tab A is reflected in tab B and vice versa', async () => {
    const cA = mountHarness('__A');
    const cB = mountHarness('__B');
    try {
      await waitFor(() => expect(ctx('__A')).toBeTruthy());

      // Tab A creates a session.
      await act(async () => {
        await ctx('__A').actions.create(input('From A'));
      });
      await waitFor(() =>
        expect(ctx('__B').sessions.some((s: Session) => s.title === 'From A')).toBe(true),
      );

      // Tab B completes it; tab A should observe the completed state.
      const bSession = ctx('__B').sessions.find((s: Session) => s.title === 'From A');
      await act(async () => {
        await ctx('__B').actions.complete(bSession.id);
      });
      await waitFor(() =>
        expect(ctx('__A').sessions.find((s: Session) => s.id === bSession.id)?.state).toBe(
          'COMPLETED',
        ),
      );
    } finally {
      document.body.removeChild(cA);
      document.body.removeChild(cB);
    }
  });

  it('a tab that misses the cross-tab broadcast keeps a stale ACTIVE until reconciliation', async () => {
    const cA = mountHarness('__A');
    const cB = mountHarness('__B');
    try {
      await waitFor(() => expect(ctx('__A')).toBeTruthy());

      // Tab A creates + activates S1; both tabs converge.
      await act(async () => {
        await ctx('__A').actions.create(input('S1'));
      });
      const s1 = ctx('__A').sessions.find((s: Session) => s.title === 'S1');
      await act(async () => {
        await ctx('__A').actions.activate(s1.id);
      });
      await waitFor(() =>
        expect(ctx('__B').sessions.find((s: Session) => s.id === s1.id)?.state).toBe('ACTIVE'),
      );

      // Drop all sync; Tab A activates S2. Tab B misses the broadcast.
      (globalThis as { __DROP_ALL_SYNC__?: boolean }).__DROP_ALL_SYNC__ = true;
      await act(async () => {
        await ctx('__A').actions.create(input('S2'));
      });
      const s2 = ctx('__A').sessions.find((s: Session) => s.title === 'S2');
      await act(async () => {
        await ctx('__A').actions.activate(s2.id);
      });
      delete (globalThis as { __DROP_ALL_SYNC__?: boolean }).__DROP_ALL_SYNC__;

      // Reproduction: divergent displays — A shows S2, B still shows S1.
      expect(ctx('__A').sessions.find((s: Session) => s.id === s2.id)?.state).toBe('ACTIVE');
      expect(ctx('__B').sessions.find((s: Session) => s.id === s1.id)?.state).toBe('ACTIVE');
      expect(ctx('__B').sessions.find((s: Session) => s.id === s2.id)?.state).not.toBe('ACTIVE');
      // The DB is single-active (S2) — the divergence is purely client-side.
      expect((await db.getMeta()).lastActiveSessionId).toBe(s2.id);

      // The fix: reconciliation on focus/visibility heals the stale tab.
      act(() => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() =>
        expect(ctx('__B').sessions.find((s: Session) => s.id === s2.id)?.state).toBe('ACTIVE'),
      );
      expect(ctx('__B').sessions.filter((s: Session) => s.state === 'ACTIVE')).toHaveLength(1);
    } finally {
      delete (globalThis as { __DROP_ALL_SYNC__?: boolean }).__DROP_ALL_SYNC__;
      document.body.removeChild(cA);
      document.body.removeChild(cB);
    }
  });
});

describe('timer hygiene & stress', () => {
  it('analytics does not run a per-second timer when no session is ACTIVE', async () => {
    const intervals: number[] = [];
    const origSet = (globalThis as { setInterval: typeof setInterval }).setInterval;
    (globalThis as { setInterval: typeof setInterval }).setInterval = ((fn: TimerHandler, ms?: number) => {
      if (ms === 1000) intervals.push(1);
      return origSet(fn, ms as number);
    }) as typeof setInterval;
    try {
      await db.createSession(input('Idle')); // PAUSED, not active
      const c = document.createElement('div');
      document.body.appendChild(c);
      await act(async () => {
        render(
          <SessionProvider>
            <AnalyticsPanel />
          </SessionProvider>,
          { container: c },
        );
      });
      await waitFor(() => expect(c.querySelector('[data-testid="analytics-panel"]')).toBeTruthy());
      await new Promise((r) => setTimeout(r, 80));
      expect(intervals).toHaveLength(0);
      document.body.removeChild(c);
    } finally {
      (globalThis as { setInterval: typeof setInterval }).setInterval = origSet;
    }
  });

  it('survives repeated focus/visibility churn without divergence', async () => {
    const cA = mountHarness('__A');
    try {
      await waitFor(() => expect(ctx('__A')).toBeTruthy());
      const s = await db.createSession(input('X'));
      await act(async () => {
        await ctx('__A').actions.activate(s.id);
      });
      for (let i = 0; i < 50; i += 1) {
        act(() => {
          window.dispatchEvent(new Event('focus'));
          document.dispatchEvent(new Event('visibilitychange'));
        });
      }
      await waitFor(() => {
        const active = ctx('__A').sessions.filter((x: Session) => x.state === 'ACTIVE');
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe(s.id);
      });
    } finally {
      document.body.removeChild(cA);
    }
  });
});
