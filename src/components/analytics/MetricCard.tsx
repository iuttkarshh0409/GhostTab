interface Props {
  label: string;
  value: string;
  testId?: string;
}

export function MetricCard({ label, value, testId }: Props) {
  return (
    <div className="metric" data-testid={testId}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
    </div>
  );
}
