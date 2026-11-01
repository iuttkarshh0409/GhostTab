import { useEffect, useRef } from 'react';
import { useSessions } from '../sessionStore';
import { isTauri, onTrayAction } from './bridge';
import { trayDecision } from './trayActions';

/**
 * Bridges desktop shell events (tray menu) into the existing frontend session
 * store. Renders nothing. In the browser it is a complete no-op, so the web
 * application and its tests are unaffected.
 *
 * The Rust shell never touches session records: it only forwards a requested
 * action, and we resolve it against the current store state here.
 */
export function DesktopBridge() {
  const { sessions, actions } = useSessions();

  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | null = null;
    let alive = true;
    (async () => {
      const unlisten = await onTrayAction(async (action) => {
        if (!alive) return;
        const decision = trayDecision(sessionsRef.current, action);
        try {
          if (decision.op === 'pause') await actions.pause(decision.id);
          else if (decision.op === 'activate') await actions.activate(decision.id);
        } catch {
          // The store surfaces errors via its own toast; ignore here.
        }
      });
      // If the component unmounted while the (async) listener was being
      // registered, drop it immediately rather than leaking it.
      if (!alive) {
        unlisten();
        return;
      }
      dispose = unlisten;
    })();
    return () => {
      alive = false;
      dispose?.();
    };
  }, [actions]);

  return null;
}
