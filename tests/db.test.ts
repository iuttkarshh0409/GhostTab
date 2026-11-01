import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '../src/db';
import { currentFocusedMs } from '../src/time';
import type { SessionInput } from '../src/types';

const input = (title = 'Session', over: Partial<SessionInput> = {}): SessionInput => ({
  title,
  description: '',
  progress: '',
  blockers: '',
  nextAction: '',
  ...over,
});

beforeEach(async () => {
  await db.resetDb();
});

describe('db', () => {
  it('createSession creates a PAUSED session with zero tracked time', async () => {
    const s = await db.createSession(input('First'));
    expect(s.id).toBeGreaterThan(0);
    expect(s.state).toBe('PAUSED');
    expect(s.totalFocusedMs).toBe(0);
    expect(s.activeStartedAt).toBeNull();
  });

  it('updateSession persists field edits', async () => {
    const s = await db.createSession(input());
    const updated = await db.updateSession(s.id, input('Renamed', { progress: 'done' }));
    expect(updated.title).toBe('Renamed');
    expect(updated.progress).toBe('done');
    const reread = await db.getSession(s.id);
    expect(reread?.title).toBe('Renamed');
    expect(reread?.nextAction).toBe('');
  });

  it('setSessionActive marks ACTIVE with activeStartedAt', async () => {
    const s = await db.createSession(input());
    const active = await db.setSessionActive(s.id, 5000);
    expect(active.state).toBe('ACTIVE');
    expect(active.activeStartedAt).toBe(5000);
  });

  it('activating a second session pauses the first and accumulates its elapsed time', async () => {
    const a = await db.createSession(input('A'));
    const b = await db.createSession(input('B'));

    await db.setSessionActive(a.id, 1000);
    await db.setSessionActive(b.id, 4000);

    const aAfter = await db.getSession(a.id);
    const bAfter = await db.getSession(b.id);

    expect(aAfter?.state).toBe('PAUSED');
    expect(aAfter?.totalFocusedMs).toBe(3000); // 1000 -> 4000
    expect(aAfter?.activeStartedAt).toBeNull();

    expect(bAfter?.state).toBe('ACTIVE');
    expect(bAfter?.totalFocusedMs).toBe(0);
    expect(bAfter?.activeStartedAt).toBe(4000);
  });

  it('only one session can ever be ACTIVE under concurrent activation', async () => {
    const a = await db.createSession(input('A'));
    const b = await db.createSession(input('B'));
    const c = await db.createSession(input('C'));

    // Fire all at once; atomic transactions must serialize and settle.
    await Promise.all([
      db.setSessionActive(a.id, 1000),
      db.setSessionActive(b.id, 1000),
      db.setSessionActive(c.id, 1000),
    ]);

    const all = await db.getAllSessions();
    const active = all.filter((s) => s.state === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(c.id);
  });

  it('pause settles the active window and clears meta', async () => {
    const s = await db.createSession(input());
    await db.setSessionActive(s.id, 1000);
    const paused = await db.pauseSession(s.id, 2500);

    expect(paused.state).toBe('PAUSED');
    expect(paused.totalFocusedMs).toBe(1500);
    expect(paused.activeStartedAt).toBeNull();

    const meta = await db.getMeta();
    expect(meta.lastActiveSessionId).toBeNull();
  });

  it('complete marks COMPLETED and settles elapsed time', async () => {
    const s = await db.createSession(input());
    await db.setSessionActive(s.id, 1000);
    const done = await db.completeSession(s.id, 6000);

    expect(done.state).toBe('COMPLETED');
    expect(done.totalFocusedMs).toBe(5000);
    expect(done.activeStartedAt).toBeNull();
  });

  it('completing an already-completed session is a no-op', async () => {
    const s = await db.createSession(input());
    await db.setSessionActive(s.id, 1000);
    await db.completeSession(s.id, 2000);
    const again = await db.completeSession(s.id, 9000);
    expect(again.state).toBe('COMPLETED');
    expect(again.totalFocusedMs).toBe(1000);
  });

  it('delete removes the session and clears meta when it was active', async () => {
    const s = await db.createSession(input());
    await db.setSessionActive(s.id, 1000);
    await db.deleteSession(s.id);

    expect(await db.getSession(s.id)).toBeUndefined();
    const meta = await db.getMeta();
    expect(meta.lastActiveSessionId).toBeNull();
  });

  it('recovery: an ACTIVE session survives a reload with accurate cumulative time', async () => {
    const s = await db.createSession(input());
    await db.setSessionActive(s.id, 1000);

    // Simulate a reload: no in-memory state; read fresh from DB.
    const reloaded = await db.getSession(s.id);
    expect(reloaded?.state).toBe('ACTIVE');
    expect(reloaded?.activeStartedAt).toBe(1000);

    // Even though the tab was closed for 9s, the elapsed time is derived
    // from the persisted wall-clock window.
    expect(currentFocusedMs(reloaded!, 10000)).toBe(9000);
  });

  it('pause on a non-active session is a no-op', async () => {
    const s = await db.createSession(input());
    const result = await db.pauseSession(s.id, 5000);
    expect(result.state).toBe('PAUSED');
    expect(result.totalFocusedMs).toBe(0);
  });

  it('restart round-trip: activated+settled focused time persists through IndexedDB', async () => {
    const s = await db.createSession(input());
    await db.setSessionActive(s.id, 1000);
    await db.pauseSession(s.id, 6000); // settle 1000 -> 6000 = 5000ms

    // Fresh read (as after an app restart): totals must be persisted, not in
    // memory.
    const reloaded = await db.getSession(s.id);
    expect(reloaded?.state).toBe('PAUSED');
    expect(reloaded?.activeStartedAt).toBeNull();
    expect(reloaded?.totalFocusedMs).toBe(5000);
    expect(currentFocusedMs(reloaded!, 99999)).toBe(5000); // paused => no growth
  });

  it('restart round-trip: single ACTIVE session and start are recovered from IndexedDB', async () => {
    const s = await db.createSession(input());
    await db.setSessionActive(s.id, 7000);

    const all = await db.getAllSessions();
    const active = all.filter((x) => x.state === 'ACTIVE');
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(s.id);
    expect(active[0].activeStartedAt).toBe(7000);
    expect(currentFocusedMs(active[0], 8000)).toBe(1000);
  });
});
