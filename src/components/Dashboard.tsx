import { useState } from 'react';
import type { Session } from '../types';
import { useSessions, useActiveSession } from '../sessionStore';
import { currentFocusedMs, formatFocused } from '../time';
import { useNow } from '../hooks/useTimer';
import { SessionCard } from './SessionCard';
import { SessionForm } from './SessionForm';
import { AnalyticsPanel } from './analytics/AnalyticsPanel';

type View = 'sessions' | 'analytics';

export function Dashboard() {
  const { sessions, actions, error, clearError } = useSessions();
  const activeSession = useActiveSession();
  const isAnyActive = activeSession !== undefined;
  const now = useNow(isAnyActive);

  const [view, setView] = useState<View>('sessions');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);

  const totalFocused = sessions.reduce((sum, s) => sum + currentFocusedMs(s, now), 0);
  const previous = sessions.filter((s) => s.state !== 'ACTIVE');
  const hasActive = activeSession !== undefined;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: Session) => {
    setEditing(s);
    setFormOpen(true);
  };

  return (
    <div className="dashboard">
      {error && (
        <div className="toast" role="alert" data-testid="error-toast">
          <span>{error}</span>
          <button className="btn btn-ghost" onClick={clearError} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <header className="dashboard-header">
        <div>
          <h1 className="app-title">GhostTab</h1>
          <p className="app-subtitle">Preserve your context. Resume exactly where you left off.</p>
        </div>
        <div className="header-actions">
          <div className="segmented" role="group" aria-label="View">
            <button
              className={`segment ${view === 'sessions' ? 'segment-active' : ''}`}
              onClick={() => setView('sessions')}
              data-testid="view-sessions"
            >
              Sessions
            </button>
            <button
              className={`segment ${view === 'analytics' ? 'segment-active' : ''}`}
              onClick={() => setView('analytics')}
              data-testid="view-analytics"
            >
              Analytics
            </button>
          </div>
          {view === 'sessions' && (
            <button className="btn btn-accent btn-large" onClick={openCreate} data-testid="new-session">
              + New session
            </button>
          )}
        </div>
      </header>

      {view === 'analytics' ? (
        <AnalyticsPanel />
      ) : (
        <>
          <section className="metrics">
            <div className="metric">
              <span className="metric-label">Active work</span>
              <span className="metric-value" data-testid="active-title">
                {hasActive ? activeSession.title : 'None'}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Total focused</span>
              <span className="metric-value" data-testid="total-focused">
                {formatFocused(totalFocused)}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Sessions</span>
              <span className="metric-value">{sessions.length}</span>
            </div>
          </section>

          {hasActive && (
            <section className="section">
              <h2 className="section-title">Now focused</h2>
              <div className="card-grid">
                <SessionCard session={activeSession} onEdit={openEdit} />
              </div>
            </section>
          )}

          <section className="section">
            <h2 className="section-title">Sessions</h2>
            {sessions.length === 0 ? (
              <p className="empty-state">No sessions yet. Create one to start tracking focus.</p>
            ) : (
              <div className="card-grid">
                {previous.map((s) => (
                  <SessionCard key={s.id} session={s} onEdit={openEdit} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <SessionForm
        open={formOpen}
        session={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => (editing ? actions.update(editing.id, input) : actions.create(input))}
      />
    </div>
  );
}
