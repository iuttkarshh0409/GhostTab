import './setup';
import { describe, it } from 'vitest';
import { computeIntelligence, computeOverview, computeWeekly } from '../src/analytics';
import type { Session } from '../src/types';

const pad2 = (n: number) => String(n).padStart(2, '0');
const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Synthetic dataset: sessions spread over `spreadDays` days, mostly settled. */
function makeData(n: number, spreadDays: number, now: number): Session[] {
  const out: Session[] = [];
  for (let i = 0; i < n; i += 1) {
    const dayOffset = (i % spreadDays) * 86_400_000;
    const createdAt = now - dayOffset - (i % 3600) * 1000;
    const ms = (i % 240) * 60_000 + ((i * 37) % 60_000);
    const state: Session['state'] = i % 7 === 0 ? 'ACTIVE' : i % 3 === 0 ? 'PAUSED' : 'COMPLETED';
    out.push({
      id: i + 1,
      title: `Session ${i}`,
      description: 'x'.repeat(20),
      progress: 'x'.repeat(20),
      blockers: '',
      nextAction: '',
      state,
      createdAt,
      updatedAt: createdAt,
      totalFocusedMs: ms,
      activeStartedAt: state === 'ACTIVE' ? now - 60_000 : null,
      focusedByDay: { [dayKey(createdAt)]: ms },
      pauseCount: i % 2,
      analyticsVersion: 2,
    });
  }
  // enforce exactly one ACTIVE for realism
  for (const s of out) if (s.state === 'ACTIVE') { s.activeStartedAt = now - 60_000; break; }
  return out;
}

const timed = (label: string, fn: () => void) => {
  const t0 = performance.now();
  fn();
  const t1 = performance.now();
  console.log(`[bench] ${label}: ${(t1 - t0).toFixed(1)}ms`);
};

describe('benchmarks (recorded, not assertions)', () => {
  it('analytics at 1k / 10k sessions', () => {
    const now = Date.now();
    for (const n of [1000, 10000]) {
      const data = makeData(n, 730, now);
      timed(`overview n=${n}`, () => computeOverview(data, 'all', now));
      timed(`weekly n=${n}`, () => computeWeekly(data, now));
      timed(`intelligence n=${n}`, () => computeIntelligence(data, 'all', now));
    }
  });

  it('analytics over a very large active window (5-year span)', () => {
    const now = Date.now();
    const fiveYearsAgo = now - 5 * 365 * 86_400_000;
    const active = makeData(1, 5 * 365, now)[0];
    active.state = 'ACTIVE';
    active.activeStartedAt = fiveYearsAgo;
    active.focusedByDay = { [dayKey(fiveYearsAgo)]: 1000 };
    timed('weekly with 5-year ACTIVE window', () => computeWeekly([active], now));
  });
});
