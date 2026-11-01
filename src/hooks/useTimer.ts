import { useEffect, useState } from 'react';

/**
 * Returns an incrementing `now` timestamp refreshed every second so the UI
 * re-renders. This is purely cosmetic: the authoritative elapsed time is
 * always computed from the persisted activeStartedAt / totalFocusedMs.
 */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [active]);

  return now;
}
