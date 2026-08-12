import { useEffect, useRef } from 'react';

/** Real user-activity signals — never a fixed deadline from sign-in. */
const ACTIVITY_EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'wheel',
] as const;

export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Auto-logout after `timeoutMs` of REAL inactivity (no click/keypress/scroll/
 * touch) while the app is open and running. Any qualifying event resets the
 * clock, so the timer never fires while the user keeps interacting — closing
 * the tab, not the timer, is what ends a session before that (session
 * persistence across reload/new-tab is handled separately, via the httpOnly
 * refresh cookie).
 */
export function useIdleLogout(
  enabled: boolean,
  onIdle: () => void,
  timeoutMs: number = IDLE_TIMEOUT_MS,
): void {
  const onIdleRef = useRef(onIdle);
  onIdleRef.current = onIdle;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setTimeout>;
    const reset = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => onIdleRef.current(), timeoutMs);
    };

    reset();
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [enabled, timeoutMs]);
}
