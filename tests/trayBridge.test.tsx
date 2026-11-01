import './setup';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { SessionProvider } from '../src/sessionStore';
import { DesktopBridge } from '../src/desktop/DesktopBridge';
import { isTauri } from '../src/desktop/bridge';
import { trayDecision, type TrayAction } from '../src/desktop/trayActions';
import type { Session } from '../src/types';

const NOW = Date.now();
const sess = (over: Partial<Session>): Session => ({
  id: 1,
  title: 'T',
  description: '',
  progress: '',
  blockers: '',
  nextAction: '',
  state: 'PAUSED',
  createdAt: NOW - 1000,
  updatedAt: NOW - 1000,
  totalFocusedMs: 0,
  activeStartedAt: null,
  focusedByDay: {},
  pauseCount: 0,
  analyticsVersion: 2,
  ...over,
});

describe('tray decision logic (frontend authority)', () => {
  it('pause is a no-op when nothing is ACTIVE', () => {
    expect(trayDecision([sess({ id: 1 })], 'pause')).toEqual({ op: 'none' });
  });

  it('pause pauses the single ACTIVE session', () => {
    const s = sess({ id: 7, state: 'ACTIVE', activeStartedAt: NOW - 1000 });
    expect(trayDecision([s], 'pause')).toEqual({ op: 'pause', id: 7 });
  });

  it('resume toggles OFF an ACTIVE session', () => {
    const s = sess({ id: 7, state: 'ACTIVE', activeStartedAt: NOW - 1000 });
    expect(trayDecision([s], 'resume')).toEqual({ op: 'pause', id: 7 });
  });

  it('resume activates the most recently touched PAUSED session', () => {
    const old = sess({ id: 1, updatedAt: NOW - 5000 });
    const recent = sess({ id: 2, updatedAt: NOW - 1000 });
    expect(trayDecision([old, recent], 'resume')).toEqual({ op: 'activate', id: 2 });
  });

  it('resume is a no-op when there is nothing to resume', () => {
    const done = sess({ id: 3, state: 'COMPLETED' });
    expect(trayDecision([done], 'resume')).toEqual({ op: 'none' });
  });

  it("open is a window-level action with no store effect", () => {
    expect(trayDecision([], 'open')).toEqual({ op: 'none' });
    const a: TrayAction = 'open';
    expect(a).toBe('open');
  });
});

describe('bridge is a safe no-op in the browser', () => {
  it('isTauri() is false under jsdom', () => {
    expect(isTauri()).toBe(false);
  });

  it('DesktopBridge renders nothing and does not crash outside Tauri', () => {
    const { container } = render(
      <SessionProvider>
        <DesktopBridge />
      </SessionProvider>,
    );
    expect(container.childNodes.length).toBe(0);
  });
});
