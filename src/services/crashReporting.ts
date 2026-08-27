import {buildReport, shouldSend} from '../core/copilot/reporter';
import {diagnosticsApi} from './api';
import {APP_VERSION_NAME} from '../config/version';

/*
 * Gets a crash off the phone and into something you can read.
 *
 * The gap this closes is not hypothetical. A hook stranded below an early
 * return took down the valet Jobs screen in production; nothing reported it,
 * and it was found hours later only because someone photographed the error.
 * Anything that fails silently in this app currently stays silent until a
 * person complains.
 *
 * Three sources, because React only sees one of them:
 *
 *   - render errors        -> ErrorBoundary calls report()
 *   - uncaught JS errors   -> ErrorUtils global handler
 *   - unhandled rejections -> a failed await nobody caught
 *
 * A boundary alone would miss the last two entirely, and in this codebase
 * those are the common shape: an async action handler that throws is not a
 * render error and no boundary will ever see it.
 */

/** Set by the navigator so a report can name where it happened. */
let currentScreen: string | undefined;

export function setCurrentScreen(name: string | undefined) {
  currentScreen = name;
}

/**
 * Send one fault. Never throws — a reporter that can fail is a second bug
 * layered on top of the one being reported, and it would fire at exactly the
 * moment the app is least able to cope.
 */
export function report(err: unknown): void {
  try {
    const r = buildReport(err, {
      platform: 'android',
      appVersion: APP_VERSION_NAME,
      screen: currentScreen,
    });
    // Once per session per fault. The backend rate-limits too, but the phone
    // is the one with the battery and the data plan — it should not be
    // relying on the server to stop it hammering.
    if (!shouldSend(r.fingerprint)) return;
    diagnosticsApi.reportError(r).catch(() => {
      /* Offline, or signed out, or the backend is the thing that is broken.
         A dropped crash report is not worth surfacing to the user. */
    });
  } catch {
    /* Reporting must never be the reason something fails. */
  }
}

let installed = false;

/**
 * Install the two global handlers. Idempotent.
 *
 * Call once at startup, before anything else can throw.
 */
export function installCrashReporting(): void {
  if (installed) return;
  installed = true;

  /*
   * The previous handler is kept and still called.
   *
   * In development that handler is what shows the red box. Replacing it
   * outright would mean a crash silently vanishing from the dev experience
   * while appearing only in a database — trading a loud local failure for a
   * quiet remote one, which is precisely backwards.
   */
  const g = globalThis as unknown as {
    ErrorUtils?: {
      getGlobalHandler: () => (e: unknown, isFatal?: boolean) => void;
      setGlobalHandler: (h: (e: unknown, isFatal?: boolean) => void) => void;
    };
  };

  if (g.ErrorUtils) {
    const previous = g.ErrorUtils.getGlobalHandler();
    g.ErrorUtils.setGlobalHandler((e, isFatal) => {
      report(e);
      previous?.(e, isFatal);
    });
  }

  /*
   * Unhandled promise rejections.
   *
   * Hermes routes these through the standard event target when available.
   * Guarded because the API is not present on every RN/engine combination
   * and a missing global here must not itself throw at startup.
   */
  const anyGlobal = globalThis as unknown as {
    addEventListener?: (t: string, cb: (ev: {reason?: unknown}) => void) => void;
  };
  try {
    anyGlobal.addEventListener?.('unhandledrejection', ev => report(ev?.reason));
  } catch {
    /* Not supported on this engine — the two handlers above still apply. */
  }
}
