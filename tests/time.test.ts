import './setup';
import { describe, expect, it } from 'vitest';
import type { Session } from '../src/types';
import {
  clampNonNegative,
  currentFocusedMs,
  elapsedSince,
  settleActiveWindow,
  formatFocused,
} from '../src/time';

const base = (over: Partial<Session> = {}): Session => ({
  id: 1,
  title: 'T',
  description: '',
  progress: '',
  blockers: '',
  nextAction: '',
  state: 'PAUSED',
  createdAt: 1000,
  updatedAt: 1000,
  totalFocusedMs: 0,
  activeStartedAt: null,
  ...over,
});

describe('time', () => {
  it('clampNonNegative floors at zero', () => {
    expect(clampNonNegative(-5)).toBe(0);
    expect(clampNonNegative(7)).toBe(7);
  });

  it('elapsedSince is zero when not ACTIVE', () => {
    const s = base({ state: 'PAUSED' });
    expect(elapsedSince(s, 5000)).toBe(0);
  });

  it('elapsedSince computes wall-clock delta while ACTIVE', () => {
    const s = base({ state: 'ACTIVE', activeStartedAt: 10000 });
    expect(elapsedSince(s, 15000)).toBe(5000);
  });

  it('elapsedSince clamps backwards clock jumps to zero', () => {
    const s = base({ state: 'ACTIVE', activeStartedAt: 10000 });
    expect(elapsedSince(s, 8000)).toBe(0);
  });

  it('currentFocusedMs sums accumulated + in-progress active window', () => {
    const s = base({ state: 'ACTIVE', activeStartedAt: 20000, totalFocusedMs: 30000 });
    expect(currentFocusedMs(s, 25000)).toBe(35000);
  });

  it('settleActiveWindow accumulates the active window and clears the start', () => {
    const s = base({ state: 'ACTIVE', activeStartedAt: 20000, totalFocusedMs: 30000 });
    const settled = settleActiveWindow(s, 25000);
    expect(settled.state).toBe('PAUSED');
    expect(settled.totalFocusedMs).toBe(35000);
    expect(settled.activeStartedAt).toBeNull();
  });

  it('settleActiveWindow is a no-op for non-active sessions', () => {
    const s = base({ state: 'COMPLETED', totalFocusedMs: 42 });
    expect(settleActiveWindow(s, 9999)).toBe(s);
  });

  it('settleActiveWindow ignores a stale/future activeStartedAt (clock jump back)', () => {
    // activeStartedAt is in the future relative to `now` (wall clock moved
    // backward, or a stale value after restart). It must NOT record negative
    // time nor inflate focus.
    const s = base({ state: 'ACTIVE', activeStartedAt: 50000, totalFocusedMs: 30000 });
    const settled = settleActiveWindow(s, 10000);
    expect(settled.state).toBe('PAUSED');
    expect(settled.totalFocusedMs).toBe(30000); // unchanged
    expect(settled.activeStartedAt).toBeNull();
    expect(settled.focusedByDay).toEqual({});
  });

  it('settleActiveWindow settles an ACTIVE session with a null start without attributing time', () => {
    // Missing activeStartedAt (corrupt/stale state): settle to PAUSED but do
    // not invent elapsed time.
    const s = base({ state: 'ACTIVE', activeStartedAt: null, totalFocusedMs: 30000 });
    const settled = settleActiveWindow(s, 10000);
    expect(settled.state).toBe('PAUSED');
    expect(settled.totalFocusedMs).toBe(30000);
    expect(settled.activeStartedAt).toBeNull();
  });

  it('does not count time while paused (activeStartedAt null)', () => {
    const s = base({ state: 'PAUSED', activeStartedAt: null, totalFocusedMs: 5000 });
    expect(elapsedSince(s, 100000)).toBe(0);
    expect(currentFocusedMs(s, 100000)).toBe(5000);
  });

  it('elapsedSince follows a forward wall-clock jump mid-session', () => {
    // Normal forward passage, including a large gap (system sleep / app closed
    // while ACTIVE): elapsed grows by the full forward delta.
    const s = base({ state: 'ACTIVE', activeStartedAt: 1000 });
    expect(elapsedSince(s, 5000)).toBe(4000);
    expect(elapsedSince(s, 3600000)).toBe(3599000); // +1h forward
    expect(currentFocusedMs(s, 3600000)).toBe(3599000);
  });

  it('settleActiveWindow accumulates a stale (old) activeStartedAt from a previous boot/sleep', () => {
    // App exited/slept while ACTIVE with an old activeStartedAt; on the next
    // settle the whole valid gap is attributed (non-negative, monotonic).
    const s = base({ state: 'ACTIVE', activeStartedAt: 1000, totalFocusedMs: 5000 });
    const settled = settleActiveWindow(s, 3600000);
    expect(settled.state).toBe('PAUSED');
    expect(settled.totalFocusedMs).toBe(5000 + 3599000);
    expect(settled.activeStartedAt).toBeNull();
  });

  it('formatFocused renders HH:MM:SS', () => {
    expect(formatFocused(0)).toBe('00:00:00');
    expect(formatFocused(90000)).toBe('00:01:30');
    expect(formatFocused(3661000)).toBe('01:01:01');
  });
});
