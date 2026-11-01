// Isolated DST test: sets TZ before any Date use so the other suites are
// unaffected. If the platform does not honor process.env.TZ, the explicit
// DST-length assertion below will fail loudly rather than silently pass.
process.env.TZ = 'America/New_York';

import './setup';
import { describe, expect, it } from 'vitest';
import { computeWeekly } from '../src/analytics';
import { dayStart } from '../src/time';

// US DST transitions in 2024: spring forward Mar 10 (23h day), fall back Nov 3 (25h day).
const springMidnight = new Date(2024, 2, 10, 0, 0, 0).getTime(); // Mar 10
const afterSpring = new Date(2024, 2, 11, 0, 0, 0).getTime(); // Mar 11
const fallMidnight = new Date(2024, 10, 3, 0, 0, 0).getTime(); // Nov 3
const afterFall = new Date(2024, 10, 4, 0, 0, 0).getTime(); // Nov 4

describe('DST handling', () => {
  it('recognizes the 23-hour spring-forward day', () => {
    expect(afterSpring - springMidnight).toBe(23 * 3600 * 1000);
  });

  it('recognizes the 25-hour fall-back day', () => {
    expect(afterFall - fallMidnight).toBe(25 * 3600 * 1000);
  });

  it('computeWeekly keys stay on consecutive local midnights across DST', () => {
    // A week centered on the spring-forward day.
    const now = new Date(2024, 2, 12, 9, 0, 0).getTime();
    const w = computeWeekly([], now);
    expect(w.days).toHaveLength(7);
    const keys = w.days.map((d) => d.key);
    // Must cover Mar 6..12 inclusively, each a local midnight.
    expect(keys).toEqual([
      '2024-03-06',
      '2024-03-07',
      '2024-03-08',
      '2024-03-09',
      '2024-03-10',
      '2024-03-11',
      '2024-03-12',
    ]);
    expect(w.days[6].key).toBe('2024-03-12');
    expect(dayStart(now)).toBe(new Date(2024, 2, 12).getTime());
  });
});
