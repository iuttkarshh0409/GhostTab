export type SessionState = 'ACTIVE' | 'PAUSED' | 'COMPLETED';

export interface Session {
  id: number;
  title: string;
  description: string;
  progress: string;
  blockers: string;
  nextAction: string;
  state: SessionState;
  createdAt: number;
  updatedAt: number;
  totalFocusedMs: number;
  activeStartedAt: number | null;
  /** Per-day focused ms (local timezone), keyed by YYYY-MM-DD. Added in v2. */
  focusedByDay?: Record<string, number>;
  /** Number of ACTIVE -> PAUSED transitions. Added in v2. */
  pauseCount?: number;
  /**
   * Analytics schema version this record has been evaluated under. Absent on
   * really old records; set to 2 by the migration (and by new sessions). When
   * 2, absent focusedByDay/pauseCount are *genuinely unknown* (legacy), never
   * zero.
   */
  analyticsVersion?: number;
}

export interface SessionInput {
  title: string;
  description: string;
  progress: string;
  blockers: string;
  nextAction: string;
}

export interface MigrationInfo {
  analyticsVersion: number;
  appliedAt: number;
}

export interface Meta {
  lastActiveSessionId: number | null;
  rev: number;
  /** Records successful analytics migration (versioned, idempotent). */
  migration?: MigrationInfo;
}

export type SessionDraft = SessionInput & Partial<Pick<Session, 'state'>>;
