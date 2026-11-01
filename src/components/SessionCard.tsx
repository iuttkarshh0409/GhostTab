import type { Session } from '../types';
import { currentFocusedMs, formatFocused } from '../time';
import { useNow } from '../hooks/useTimer';
import { useSessions } from '../sessionStore';

interface Props {
  session: Session;
  onEdit: (session: Session) => void;
}

const STATE_LABEL: Record<Session['state'], string> = {
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
};

export function SessionCard({ session, onEdit }: Props) {
  const { actions } = useSessions();
  const isActive = session.state === 'ACTIVE';
  const now = useNow(isActive);
  const focused = formatFocused(currentFocusedMs(session, now));

  return (
    <article className={`session-card state-${session.state.toLowerCase()}`} data-testid={`session-${session.id}`}>
      <header className="card-header">
        <h3 className="card-title">{session.title}</h3>
        <span className={`badge badge-${session.state.toLowerCase()}`}>{STATE_LABEL[session.state]}</span>
      </header>

      {session.description && <p className="card-desc">{session.description}</p>}

      <dl className="card-details">
        {session.progress && (
          <div className="detail-row">
            <dt>Progress</dt>
            <dd>{session.progress}</dd>
          </div>
        )}
        {session.blockers && (
          <div className="detail-row">
            <dt>Blockers</dt>
            <dd>{session.blockers}</dd>
          </div>
        )}
        {session.nextAction && (
          <div className="detail-row">
            <dt>Next action</dt>
            <dd>{session.nextAction}</dd>
          </div>
        )}
      </dl>

      <footer className="card-footer">
        <div className="focused-time" data-testid={`focused-${session.id}`}>
          <span className="focused-label">{isActive ? 'Focused (live)' : 'Focused'}</span>
          <span className="focused-value">{focused}</span>
        </div>
        <div className="card-actions">
          {isActive && (
            <button className="btn" data-testid={`pause-${session.id}`} onClick={() => actions.pause(session.id)}>
              Pause
            </button>
          )}
          {!isActive && session.state === 'PAUSED' && (
            <button className="btn btn-accent" data-testid={`resume-${session.id}`} onClick={() => actions.activate(session.id)}>
              Resume
            </button>
          )}
          {!isActive && session.state !== 'COMPLETED' && (
            <button className="btn" data-testid={`activate-${session.id}`} onClick={() => actions.activate(session.id)}>
              Activate
            </button>
          )}
          {session.state !== 'COMPLETED' && (
            <button className="btn" data-testid={`complete-${session.id}`} onClick={() => actions.complete(session.id)}>
              Complete
            </button>
          )}
          <button className="btn btn-ghost" data-testid={`edit-${session.id}`} onClick={() => onEdit(session)}>
            Edit
          </button>
          <button className="btn btn-danger" data-testid={`delete-${session.id}`} onClick={() => { if (window.confirm(`Delete "${session.title}"?`)) actions.remove(session.id); }}>
            Delete
          </button>
        </div>
      </footer>
    </article>
  );
}
