import type { DayActivity } from '../../analytics';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const weekdayLabel = (key: string): string => {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return WEEKDAYS[date.getDay()];
};

interface Props {
  days: DayActivity[];
}

export function ActivityChart({ days }: Props) {
  const max = Math.max(...days.map((d) => d.ms), 1);
  const barW = 48;
  const gap = 26;
  const chartW = days.length * (barW + gap) - gap;
  const chartH = 160;
  const baseY = 170;
  const labelY = 200;

  const fmt = (ms: number) => {
    const mins = Math.round(ms / 60000);
    if (mins >= 60) return `${Math.floor(mins / 60)}h ${mins % 60}m`;
    return `${mins}m`;
  };

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${chartW + 40} 220`}
        width="100%"
        role="img"
        aria-label="Focused time per day over the last seven days"
        data-testid="activity-chart"
      >
        {days.map((d, i) => {
          const x = 30 + i * (barW + gap);
          const barH = d.ms > 0 ? Math.max(4, (d.ms / max) * chartH) : 2;
          const y = baseY - barH;
          const isMax = d.ms === max && d.ms > 0;
          return (
            <g key={d.key}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={6}
                className={isMax ? 'chart-bar chart-bar-max' : 'chart-bar'}
                data-zero={d.ms === 0 ? 'true' : 'false'}
              >
                <title>{`${d.key}: ${fmt(d.ms)}`}</title>
              </rect>
              <text x={x + barW / 2} y={labelY} textAnchor="middle" className="chart-label">
                {weekdayLabel(d.key)}
              </text>
              <text x={x + barW / 2} y={baseY + 14} textAnchor="middle" className="chart-value">
                {d.ms > 0 ? fmt(d.ms) : ''}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
