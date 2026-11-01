import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Session, SessionInput, Meta, SessionState } from './types';
import { settleActiveWindow } from './time';

interface GhostTabDB extends DBSchema {
  sessions: {
    key: number;
    value: Session;
    indexes: { 'by-state': SessionState };
  };
  meta: { key: string; value: Meta };
}

const DB_NAME = 'ghosttab';
const DB_VERSION = 2;
/** Analytics schema version introduced by this migration. */
export const CURRENT_ANALYTICS_VERSION = 2;

const dbPromise: Promise<IDBPDatabase<GhostTabDB>> = openDB<GhostTabDB>(
  DB_NAME,
  DB_VERSION,
  {
    upgrade(db) {
      // Non-destructive: only create stores/indexes that don't exist yet.
      // Bumping DB_VERSION to 2 triggers this with oldVersion=1; existing
      // `sessions`/`meta` stores are preserved untouched.
      if (!db.objectStoreNames.contains('sessions')) {
        const sessions = db.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true });
        sessions.createIndex('by-state', 'state');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    },
  },
);

const emptyMeta = (): Meta => ({ lastActiveSessionId: null, rev: 0 });

/**
 * Versioned analytics migration.
 *
 * Runs as a single `readwrite` transaction over `sessions` + `meta`:
 *   1. reads the meta flag;
 *   2. if already migrated (analyticsVersion >= current), does nothing;
 *   3. otherwise sweeps every session, stamping a per-record
 *      `analyticsVersion` marker WITHOUT changing `totalFocusedMs`,
 *      `focusedByDay` or `pauseCount`;
 *   4. writes the meta flag in the SAME transaction.
 *
 * Atomicity guarantees that either every record carries the marker AND the
 * flag is set, or (on interruption/failure) neither is — so a retry is always
 * safe and a "partially migrated" state cannot be observed. Legacy records
 * (fields absent) remain distinguishable from tracked records (fields present)
 * permanently; we never fabricate day/pause data.
 */
export const ensureAnalyticsMigration = async (): Promise<void> => {
  const db = await dbPromise;
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  const sStore = tx.objectStore('sessions');
  const mStore = tx.objectStore('meta');

  const meta = ((await mStore.get('meta')) as Meta | undefined) ?? emptyMeta();
  if (meta.migration && meta.migration.analyticsVersion >= CURRENT_ANALYTICS_VERSION) {
    await tx.done;
    return;
  }

  const all = await sStore.getAll();
  for (const s of all) {
    if (s.analyticsVersion !== CURRENT_ANALYTICS_VERSION) {
      s.analyticsVersion = CURRENT_ANALYTICS_VERSION;
      await sStore.put(s);
    }
  }

  meta.migration = { analyticsVersion: CURRENT_ANALYTICS_VERSION, appliedAt: Date.now() };
  await mStore.put(meta, 'meta');
  await tx.done;
};

/** Read all sessions, newest first. */
export const getAllSessions = async (): Promise<Session[]> => {
  const db = await dbPromise;
  const all = await db.getAll('sessions');
  return all.sort((a, b) => b.createdAt - a.createdAt);
};

export const getSession = async (id: number): Promise<Session | undefined> => {
  const db = await dbPromise;
  return db.get('sessions', id);
};

export const getMeta = async (): Promise<Meta> => {
  const db = await dbPromise;
  return (await db.get('meta', 'meta')) ?? emptyMeta();
};

export const createSession = async (input: SessionInput): Promise<Session> => {
  const db = await dbPromise;
  const now = Date.now();
  const session: Omit<Session, 'id'> = {
    ...input,
    state: 'PAUSED',
    createdAt: now,
    updatedAt: now,
    totalFocusedMs: 0,
    activeStartedAt: null,
    focusedByDay: {},
    pauseCount: 0,
    analyticsVersion: CURRENT_ANALYTICS_VERSION,
  };
  // Let the object store auto-increment `id` (keyPath).
  const id = await db.add('sessions', session as Session);
  return { ...session, id };
};

export const updateSession = async (id: number, input: SessionInput): Promise<Session> => {
  const db = await dbPromise;
  const existing = await db.get('sessions', id);
  if (!existing) throw new Error('Session not found');
  const updated: Session = { ...existing, ...input, updatedAt: Date.now() };
  await db.put('sessions', updated);
  return updated;
};

/**
 * Atomic activate/resume. Within a single readwrite transaction this
 * settles any other ACTIVE session, sets the target ACTIVE, and bumps
 * meta.rev. IndexedDB serializes overlapping readwrite transactions, so
 * the single-ACTIVE invariant holds even across tabs / rapid calls.
 */
export const setSessionActive = async (id: number, now = Date.now()): Promise<Session> => {
  const db = await dbPromise;
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  const sStore = tx.objectStore('sessions');
  const mStore = tx.objectStore('meta');

  // Read + validate the target FIRST, before touching any other active session,
  // so a missing or completed target fails fast (the transaction aborts and
  // rolls back, so no other record is modified).
  const target = await sStore.get(id);
  if (!target) throw new Error('Session not found');
  if (target.state === 'COMPLETED') {
    throw new Error('Cannot activate a completed session');
  }

  const activeAll = await sStore.index('by-state').getAll('ACTIVE');
  for (const s of activeAll) {
    if (s.id === id) continue;
    const settled = settleActiveWindow(s, now);
    settled.updatedAt = now;
    settled.pauseCount = (settled.pauseCount ?? 0) + 1; // auto-pause counts as a pause
    await sStore.put(settled);
  }

  target.state = 'ACTIVE';
  target.activeStartedAt = now;
  target.updatedAt = now;
  await sStore.put(target);

  const meta = ((await mStore.get('meta')) as Meta | undefined) ?? emptyMeta();
  meta.lastActiveSessionId = id;
  meta.rev += 1;
  await mStore.put(meta, 'meta');

  await tx.done;
  return target;
};

/** Pause: settle the active window, clear meta if this was the active one. */
export const pauseSession = async (id: number, now = Date.now()): Promise<Session> => {
  const db = await dbPromise;
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  const sStore = tx.objectStore('sessions');
  const mStore = tx.objectStore('meta');

  const s = await sStore.get(id);
  if (!s) throw new Error('Session not found');
  if (s.state !== 'ACTIVE') {
    await tx.done;
    return s;
  }

  const settled = settleActiveWindow(s, now);
  settled.updatedAt = now;
  settled.pauseCount = (settled.pauseCount ?? 0) + 1;
  await sStore.put(settled);

  const meta = ((await mStore.get('meta')) as Meta | undefined) ?? emptyMeta();
  if (meta.lastActiveSessionId === id) {
    meta.lastActiveSessionId = null;
    meta.rev += 1;
    await mStore.put(meta, 'meta');
  }

  await tx.done;
  return settled;
};

/** Complete: settle the active window and mark COMPLETED. */
export const completeSession = async (id: number, now = Date.now()): Promise<Session> => {
  const db = await dbPromise;
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  const sStore = tx.objectStore('sessions');
  const mStore = tx.objectStore('meta');

  const s = await sStore.get(id);
  if (!s) throw new Error('Session not found');
  if (s.state === 'COMPLETED') {
    await tx.done;
    return s;
  }

  // Only settle the active window for sessions that are actually ACTIVE.
  // A PAUSED (or otherwise non-active) session must not accumulate time from a
  // stale activeStartedAt; clear that field so it never lingers.
  let settled: Session;
  if (s.state === 'ACTIVE') {
    settled = settleActiveWindow(s, now);
  } else {
    settled = { ...s, activeStartedAt: null };
  }
  settled = { ...settled, state: 'COMPLETED', updatedAt: now };
  await sStore.put(settled);

  const meta = ((await mStore.get('meta')) as Meta | undefined) ?? emptyMeta();
  if (meta.lastActiveSessionId === id) {
    meta.lastActiveSessionId = null;
    meta.rev += 1;
    await mStore.put(meta, 'meta');
  }

  await tx.done;
  return settled;
};

/** Test helper: wipe all data. Not used by the application. */
export const resetDb = async (): Promise<void> => {
  const db = await dbPromise;
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  await tx.objectStore('sessions').clear();
  await tx.objectStore('meta').clear();
  await tx.done;
};

/** Delete. If the deleted id is the active pointer, clear it unconditionally. */
export const deleteSession = async (id: number): Promise<void> => {
  const db = await dbPromise;
  const tx = db.transaction(['sessions', 'meta'], 'readwrite');
  const sStore = tx.objectStore('sessions');
  const mStore = tx.objectStore('meta');

  await sStore.delete(id);

  // Clear the ACTIVE pointer whenever the deleted id IS the active session.
  // This is independent of whether the record was still present (it may have
  // been removed concurrently by another tab, leaving meta pointing at a
  // nonexistent session — we must still clear it).
  const meta = ((await mStore.get('meta')) as Meta | undefined) ?? emptyMeta();
  if (meta.lastActiveSessionId === id) {
    meta.lastActiveSessionId = null;
    meta.rev += 1;
    await mStore.put(meta, 'meta');
  }

  await tx.done;
};
