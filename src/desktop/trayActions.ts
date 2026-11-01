import type { Session } from '../types';

/** Tray menu actions the Rust shell may request. */
export type TrayAction = 'pause' | 'resume' | 'open';

/**
 * Result of interpreting a tray action against the current session state.
 * The Rust shell never reads or writes session records; it only forwards the
 * requested action, and the frontend decides what (if anything) to do.
 */
export type TrayDecision =
  | { op: 'none' }
  | { op: 'pause'; id: number }
  | { op: 'activate'; id: number };

export function trayDecision(sessions: Session[], action: TrayAction): TrayDecision {
  const active = sessions.find((s) => s.state === 'ACTIVE');

  switch (action) {
    case 'pause':
      return active ? { op: 'pause', id: active.id } : { op: 'none' };
    case 'resume': {
      // If something is running, "Resume" toggles it off (pause).
      if (active) return { op: 'pause', id: active.id };
      // Otherwise resume the most recently touched PAUSED session, if any.
      const latest = sessions
        .filter((s) => s.state === 'PAUSED')
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return latest ? { op: 'activate', id: latest.id } : { op: 'none' };
    }
    default:
      // 'open' is a window-level action; the frontend has nothing to do.
      return { op: 'none' };
  }
}
