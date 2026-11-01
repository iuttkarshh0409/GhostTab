import { useMemo, useState } from 'react';
import type { AnalyticsRange } from '../../analytics';
import { computeIntelligence, computeOverview, computeWeekly } from '../../analytics';
import { useSessions } from '../../sessionStore';
import { useNow } from '../../hooks/useTimer';
import { formatFocused } from '../../time';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { IntelligenceSection } from './IntelligenceSection';

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export function AnalyticsPanel() {
  const { sessions } = useSessions();
  const [range, setRange] = useState<AnalyticsRange>('7d');
  // Only tick the cosmetic clock when a session is ACTIVE. When nothing is
  // active the analytics are static, so there is no need to recompute them
  // once per second (this avoids useless O(n) work on a 1s timer).
  const isAnyActive = sessions.some((s) => s.state === 'ACTIVE');
  const now = useNow(isAnyActive);

  const overview = useMemo(() => computeOverview(sessions, range, now), [sessions, range, now]);
  const weekly = useMemo(() => computeWeekly(sessions, now), [sessions, now]);
  const intelligence = useMemo(() => computeIntelligence(sessions, range, now), [sessions, range, now]);

  return (
    <div className="analytics" data-testid="analytics-panel">
      <div className="analytics-header">
        <div>
          <h2 className="analytics-title">Analytics</h2>
          <p className="app-subtitle">Productivity insights derived from your sessions.</p>
        </div>
        <div className="segmented" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.value}
              className={`segment ${range === r.value ? 'segment-active' : ''}`}
              onClick={() => setRange(r.value)}
              data-testid={`range-${r.value}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="caveat" data-testid="coverage-note">
        {overview.trackedSessions} tracked · {overview.legacySessions} legacy session(s). Legacy
        (pre-tracking) sessions contribute to lifetime totals, but their daily and pause history is
        unknown and is never invented.
      </p>

      {sessions.length === 0 ? (
        <p className="empty-state" data-testid="analytics-empty">
          No sessions yet — analytics will appear once you have data.
        </p>
      ) : (
        <>
          <section className="section">
            <h2 className="section-title">Productivity overview</h2>
            <div className="metrics metrics-analytics">
              <MetricCard label="Total focused" value={formatFocused(overview.totalFocusedMs)} testId="ov-total" />
              <MetricCard label="Sessions created" value={String(overview.totalSessions)} testId="ov-sessions" />
              <MetricCard label="Completed" value={String(overview.completed)} testId="ov-completed" />
              <MetricCard label="Paused" value={String(overview.paused)} testId="ov-paused" />
              <MetricCard label="Avg duration" value={formatFocused(overview.avgDurationMs)} testId="ov-avg" />
              <MetricCard label="Longest" value={formatFocused(overview.longestMs)} testId="ov-longest" />
            </div>
          </section>

          <section className="section">
            <h2 className="section-title">Weekly activity</h2>
            {weekly.hasLegacy && (
              <p className="unavailable-note" data-testid="weekly-legacy-note">
                Daily breakdown unavailable for{' '}
                <strong>{weekly.legacySessions}</strong> legacy session(s). Their known lifetime
                total ({formatFocused(weekly.unattributedMs)}) is included in the overview, not
                shown as daily activity.
              </p>
            )}
            <ActivityChart days={weekly.days} />
            <div className="weekly-meta">
              <span className="meta-chip">
                Most productive day:{' '}
                <strong data-testid="productive-day">{weekly.mostProductiveDay ?? '—'}</strong>
              </span>
              <span className="meta-chip">
                Daily average:{' '}
                <strong data-testid="daily-average">{formatFocused(weekly.dailyAverageMs)}</strong>
              </span>
            </div>
          </section>

          <IntelligenceSection intelligence={intelligence} />
        </>
      )}
    </div>
  );
}
