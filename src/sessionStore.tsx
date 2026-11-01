import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session, SessionInput, Meta } from './types';
import * as db from './db';

interface StoreState {
  sessions: Session[];
  meta: Meta;
  loading: boolean;
}

type Action =
  | { type: 'LOADED'; sessions: Session[]; meta: Meta }
  | { type: 'SET'; sessions: Session[]; meta: Meta };

const initialState: StoreState = { sessions: [], meta: { lastActiveSessionId: null, rev: 0 }, loading: true };

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'LOADED':
      return { sessions: action.sessions, meta: action.meta, loading: false };
    case 'SET':
      return { sessions: action.sessions, meta: action.meta, loading: state.loading };
    default:
      return state;
  }
}

export interface SessionActions {
  create: (input: SessionInput) => Promise<Session>;
  update: (id: number, input: SessionInput) => Promise<void>;
  remove: (id: number) => Promise<void>;
  activate: (id: number) => Promise<void>;
  pause: (id: number) => Promise<void>;
  complete: (id: number) => Promise<void>;
}

const asVoid = (p: Promise<unknown>): Promise<void> => p.then(() => undefined);

interface StoreShape extends StoreState {
  actions: SessionActions;
  error: string | null;
  clearError: () => void;
}

const SessionContext = createContext<StoreShape | null>(null);

// In-process mutation queue: serializes read-modify-write cycles so rapid
// clicks never overlap. Cross-tab correctness is handled by atomic IDB
// transactions inside the db layer.
const queue = (() => {
  let chain: Promise<unknown> = Promise.resolve();
  return <T,>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
})();

const refresh = async (): Promise<Pick<StoreState, 'sessions' | 'meta'>> => {
  const [sessions, meta] = await Promise.all([db.getAllSessions(), db.getMeta()]);
  return { sessions, meta };
};

const SYNC_CHANNEL = 'ghosttab:sync';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [error, setError] = useState<string | null>(null);

  // Per-provider identity for cross-tab broadcast filtering. Each mounted
  // provider (tab) gets a unique sender id so self-messages are ignored.
  const senderRef = useRef<string>('');
  if (senderRef.current === '') senderRef.current = Math.random().toString(36).slice(2);
  const syncChannelRef = useRef<BroadcastChannel | null>(null);

  // Initial load (recovers an ACTIVE session after reload and leaves the
  // DB as the source of truth).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Apply the versioned analytics migration before reading data so legacy
      // records are flagged/read consistently. It is idempotent.
      await db.ensureAnalyticsMigration();
      const data = await refresh();
      if (!cancelled) dispatch({ type: 'LOADED', ...data });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Cross-tab synchronization: listen for changes made by other tabs and
  // re-read the authoritative DB. Guarded so environments without
  // BroadcastChannel (e.g. jsdom) simply skip it.
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL);
      syncChannelRef.current = channel;
      channel.onmessage = (ev) => {
        if (ev.data?.sender === senderRef.current) return;
        refresh()
          .then((data) => dispatch({ type: 'SET', ...data }))
          .catch(() => {});
      };
    } catch {
      // BroadcastChannel unsupported; fall back to local-only behavior.
    }
    return () => {
      try {
        channel?.close();
      } catch {
        // ignore
      }
      syncChannelRef.current = null;
    };
  }, []);

  // Self-healing reconciliation: if a cross-tab broadcast was missed (e.g.
  // a backgrounded/throttled tab, a lost delivery, or a torn-down listener),
  // re-read the authoritative DB when the tab becomes visible/focused so the
  // mirror can never pin a stale ACTIVE session.
  useEffect(() => {
    const reconcile = () => {
      if (document.visibilityState !== 'visible') return;
      refresh()
        .then((data) => dispatch({ type: 'SET', ...data }))
        .catch(() => {});
    };
    const onFocus = () => reconcile();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') reconcile();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const notifyOthers = useCallback(() => {
    const ch = syncChannelRef.current;
    if (!ch) return;
    try {
      ch.postMessage({ sender: senderRef.current });
    } catch {
      // ignore
    }
  }, []);

  const runMutation = useCallback(async <T,>(fn: () => Promise<T>) => {
    try {
      const result = await queue(fn);
      const data = await refresh();
      dispatch({ type: 'SET', ...data });
      notifyOthers();
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong';
      setError(message);
      // Realign the mirror to the authoritative DB even on failure, so a
      // failed/raced mutation never leaves misleading UI state behind.
      try {
        const data = await refresh();
        dispatch({ type: 'SET', ...data });
      } catch {
        // ignore refresh failure
      }
      throw e;
    }
  }, [notifyOthers]);

  const actions = useMemo<SessionActions>(
    () => ({
      create: (input) => runMutation(() => db.createSession(input)),
      update: (id, input) => runMutation(async () => asVoid(db.updateSession(id, input))),
      remove: (id) => runMutation(() => db.deleteSession(id)),
      activate: (id) => runMutation(async () => asVoid(db.setSessionActive(id))),
      pause: (id) => runMutation(async () => asVoid(db.pauseSession(id))),
      complete: (id) => runMutation(async () => asVoid(db.completeSession(id))),
    }),
    [runMutation],
  );

  const clearError = useCallback(() => setError(null), []);
  const value = useMemo(
    () => ({ ...state, actions, error, clearError }),
    [state, actions, error, clearError],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSessions(): StoreShape {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSessions must be used within SessionProvider');
  return ctx;
}

/** Convenience: the single ACTIVE session (if any). */
export function useActiveSession(): Session | undefined {
  const { sessions } = useSessions();
  return sessions.find((s) => s.state === 'ACTIVE');
}
