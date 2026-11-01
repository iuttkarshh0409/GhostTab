import type { TrayAction } from './trayActions';

/**
 * True when running inside the Tauri WebView. The app remains a normal web
 * app everywhere else, so every desktop integration path is guarded by this
 * and degrades to a no-op in the browser.
 */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Subscribe to tray-menu actions emitted by the Rust shell. Rust only tells
 * the frontend *which* action was requested; the frontend (session store) is
 * the sole authority over session records.
 */
export async function onTrayAction(
  handler: (action: TrayAction) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import('@tauri-apps/api/event');
  const unlisten = await listen<TrayAction>('tray-menu', (event) => {
    const a = event.payload;
    if (a === 'pause' || a === 'resume' || a === 'open') handler(a);
  });
  return unlisten;
}

/** Best-effort desktop notification. No-op in the browser / without permission. */
export async function desktopNotify(title: string, body: string): Promise<void> {
  if (!isTauri()) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    if (granted) sendNotification({ title, body });
  } catch {
    // Notifications unsupported or not configured — ignore.
  }
}
