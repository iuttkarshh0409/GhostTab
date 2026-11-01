import type { Intelligence } from '../../analytics';
import { formatFocused } from '../../time';

interface Props {
  intelligence: Intelligence;
}

export function IntelligenceSection({ intelligence }: Props) {
  const {
    longestCompletedMs,
    longestCompletedTitle,
    completionRate,
    multiPaused,
    withPauseData,
    withoutPauseData,
    recent,
  } = intelligence;

  const pauseFullyKnown = withoutPauseData === 0;
  const pauseNoneTracked = withPauseData === 0;

  return (
    <section className="section">
      <h2 className="section-title">Session intelligence</h2>
      <div className="intel-grid">
        <div className="intel-card">
          <span className="metric-label">Longest completed</span>
          <span className="intel-main">
            {longestCompletedMs !== null ? formatFocused(longestCompletedMs) : '—'}
          </span>
          {longestCompletedTitle && <span className="intel-sub">{longestCompletedTitle}</span>}
        </div>
        <div className="intel-card">
          <span className="metric-label">Completion rate</span>
          <span className="intel-main" data-testid="completion-rate">
            {completionRate.toFixed(0)}%
          </span>
        </div>
        <div className="intel-card">
          <span className="metric-label">Paused multiple times</span>
          {pauseFullyKnown ? (
            <>
              <span className="intel-main" data-testid="multi-paused">
                {multiPaused.length}
              </span>
              <span className="intel-sub">sessions with 2+ pauses</span>
            </>
          ) : pauseNoneTracked ? (
            <>
              <span className="intel-main" data-testid="multi-paused-unknown">
                —
              </span>
              <span className="intel-sub">Pause history unavailable for legacy sessions.</span>
            </>
          ) : (
            <>
              <span className="intel-main" data-testid="multi-paused-partial">
                {multiPaused.length}
              </span>
              <span className="intel-sub">
                from {withPauseData} tracked; {withoutPauseData} legacy unknown
              </span>
            </>
          )}
        </div>
      </div>

      <div className="recent-block">
        <h3 className="sub-title">Recent activity</h3>
        {recent.length === 0 ? (
          <p className="empty-state empty-inline">No activity in this range.</p>
        ) : (
          <ul className="recent-list">
            {recent.map((s) => (
              <li key={s.id} className="recent-item">
                <span className="recent-title">{s.title}</span>
                <span className={`badge badge-${s.state.toLowerCase()}`}>{s.state}</span>
                <span className="recent-when">{new Date(s.updatedAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
