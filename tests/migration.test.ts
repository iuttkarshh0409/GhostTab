import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDB } from 'idb';
import * as db from '../src/db';
import { computeIntelligence, computeOverview, computeWeekly } from '../src/analytics';
import { getMeta } from '../src/db';
import type { Session } from '../src/types';

const NOW = new Date(2024, 0, 5, 12, 0, 0).getTime();

const legacyRecord = (over: Partial<Session> = {}): Omit<Session, 'id'> => ({
  title: 'Legacy',
  description: '',
  progress: '',
  blockers: '',
  nextAction: '',
  state: 'PAUSED',
  createdAt: NOW - 86400000,
  updatedAt: NOW - 86400000,
  totalFocusedMs: 123456,
  activeStartedAt: null,
  ...over,
});

/** Insert a raw record directly (bypassing createSession) to simulate legacy data. */
const seedRaw = async (record: Omit<Session, 'id'>): Promise<number> => {
  const raw = await openDB('ghosttab', 2, {
    upgrade(dbb) {
      if (!dbb.objectStoreNames.contains('sessions')) {
        const s = dbb.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        s.createIndex('by-state', 'state');
      }
      if (!dbb.objectStoreNames.contains('meta')) dbb.createObjectStore('meta');
    },
  });
  const id = await raw.add('sessions', record);
  raw.close();
  return id as number;
};

beforeEach(async () => {
  await db.resetDb();
});

describe('analytics migration', () => {
  it('migrates and stamps meta without altering legacy records', async () => {
    const id = await seedRaw(legacyRecord());
    await db.ensureAnalyticsMigration();

    const meta = await getMeta();
    expect(meta.migration?.analyticsVersion).toBe(2);
    expect(meta.migration?.appliedAt).toBeGreaterThan(0);

    const got = await db.getSession(id);
    // totalFocusedMs preserved exactly.
    expect(got?.totalFocusedMs).toBe(123456);
    // Per-record marker written by the migration.
    expect(got?.analyticsVersion).toBe(2);
    // Legacy fields remain absent (unknown), not fabricated as zero.
    expect(got?.focusedByDay).toBeUndefined();
    expect(got?.pauseCount).toBeUndefined();
  });

  it('is idempotent: a second run does not bump the stamp', async () => {
    await seedRaw(legacyRecord());
    await db.ensureAnalyticsMigration();
    const first = await getMeta();
    await db.ensureAnalyticsMigration();
    const second = await getMeta();
    expect(second.migration?.analyticsVersion).toBe(2);
    expect(second.migration?.appliedAt).toBe(first.migration?.appliedAt);
  });

  it('recovers from an interrupted run (no stamp) and retries safely', async () => {
    await seedRaw(legacyRecord());
    // Simulate an interrupted run: no stamp present.
    const rw = await db.getMeta();
    expect(rw.migration).toBeUndefined();
    // Retry succeeds and stamps exactly once.
    await db.ensureAnalyticsMigration();
    expect((await getMeta()).migration?.analyticsVersion).toBe(2);
    await db.ensureAnalyticsMigration();
    expect((await getMeta()).migration?.analyticsVersion).toBe(2);
  });

  it('atomic: after one run every record is marked and the flag is set', async () => {
    const a = await seedRaw(legacyRecord({ title: 'A' }));
    const b = await seedRaw(legacyRecord({ title: 'B' }));
    await db.ensureAnalyticsMigration();
    const [sa, sb] = await Promise.all([db.getSession(a), db.getSession(b)]);
    expect(sa?.analyticsVersion).toBe(2);
    expect(sb?.analyticsVersion).toBe(2);
    expect((await getMeta()).migration?.analyticsVersion).toBe(2);
  });

  it('new sessions carry the analytics version marker from creation', async () => {
    const s = await db.createSession({ title: 'New', description: '', progress: '', blockers: '', nextAction: '' });
    expect(s.analyticsVersion).toBe(2);
    expect(s.focusedByDay).toEqual({});
    expect(s.pauseCount).toBe(0);
  });

  it('does not overwrite an equal-or-newer migration version', async () => {
    await seedRaw(legacyRecord());
    await db.ensureAnalyticsMigration();
    const meta = await getMeta();
    const appliedAt = meta.migration!.appliedAt;
    await db.ensureAnalyticsMigration();
    expect((await getMeta()).migration!.appliedAt).toBe(appliedAt);
  });

  it('keeps all migrated records accessible', async () => {
    const id1 = await seedRaw(legacyRecord({ title: 'A' }));
    const id2 = await seedRaw(legacyRecord({ title: 'B' }));
    await db.ensureAnalyticsMigration();
    const all = await db.getAllSessions();
    expect(all.map((s) => s.id)).toEqual(expect.arrayContaining([id1, id2]));
    expect(all).toHaveLength(2);
  });
});

describe('legacy vs tracked distinction', () => {
  it('overview reports legacy and tracked counts', async () => {
    const legacyId = await seedRaw(legacyRecord());
    const tracked = await db.createSession({ title: 'New', description: '', progress: '', blockers: '', nextAction: '' });
    await db.ensureAnalyticsMigration();

    const legacy = await db.getSession(legacyId);
    expect(legacy).toBeDefined();
    const o = computeOverview([legacy!, tracked], 'all', NOW);
    expect(o.legacySessions).toBe(1);
    expect(o.trackedSessions).toBe(1);
    expect(o.totalFocusedMs).toBe(123456 + 0); // legacy total preserved, new tracked has 0
  });

  it('weekly marks legacy time as unattributed, never as chart zero', async () => {
    const legacyId = await seedRaw(legacyRecord({ totalFocusedMs: 999000 }));
    const tracked = await db.createSession({ title: 'T', description: '', progress: '', blockers: '', nextAction: '' });
    tracked.focusedByDay = { '2024-01-03': 5000 };
    await db.ensureAnalyticsMigration();

    const legacy = await db.getSession(legacyId);
    expect(legacy).toBeDefined();
    const w = computeWeekly([legacy!, tracked], NOW);
    expect(w.hasLegacy).toBe(true);
    expect(w.legacySessions).toBe(1);
    expect(w.unattributedMs).toBe(999000);
    // The legacy total must not appear as a day bar.
    const anyBar = w.days.some((d) => d.ms === 999000);
    expect(anyBar).toBe(false);
    expect(w.days.find((d) => d.key === '2024-01-03')?.ms).toBe(5000);
  });

  it('distinguishes known zero from unknown pause counts', async () => {
    const legacyId = await seedRaw(legacyRecord()); // pause count unknown
    const trackedZero = await db.createSession({ title: 'Z', description: '', progress: '', blockers: '', nextAction: '' });
    // trackedZero.pauseCount === 0 (known zero)
    await db.ensureAnalyticsMigration();

    const legacy = await db.getSession(legacyId);
    expect(legacy).toBeDefined();
    const i = computeIntelligence([legacy!, trackedZero], 'all', NOW);
    expect(i.withPauseData).toBe(1); // trackedZero
    expect(i.withoutPauseData).toBe(1); // legacy
    expect(i.multiPaused).toHaveLength(0);
  });

  it('partially populated records are reported as incomplete for pause data', async () => {
    const partialId = await seedRaw(legacyRecord({ focusedByDay: { '2024-01-01': 500 } }));
    await db.ensureAnalyticsMigration();
    const partial = await db.getSession(partialId);
    // has daily data but NO pauseCount -> pause data incomplete
    const i = computeIntelligence([partial!], 'all', NOW);
    expect(i.withPauseData).toBe(0);
    expect(i.withoutPauseData).toBe(1);
  });
});
