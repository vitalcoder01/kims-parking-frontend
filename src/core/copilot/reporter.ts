/*
 * Turns a crash into something you can act on, without turning it into a
 * privacy problem.
 *
 * The motivating case is real and recent: a hook stranded below an early
 * return took down the valet Jobs screen in production. Nothing reported it.
 * It was found hours later because someone photographed their phone. With
 * this, the same fault reaches the backend the instant it happens, carrying
 * the file, the line, the role and a count.
 *
 * Platform-free on purpose — no React, no fetch, no AsyncStorage — so mobile
 * and web share one scrubber and one fingerprint definition. Both matter:
 * a scrubber that differs between clients leaks on whichever side is weaker,
 * and a fingerprint that differs means the same fault lands as two rows.
 */

export interface ErrorReport {
  fingerprint: string;
  platform: 'android' | 'web';
  appVersion: string;
  name: string;
  message: string;
  stack?: string;
  screen?: string;
}

/*
 * ── Scrubbing ────────────────────────────────────────────────────────────
 *
 * Error text in this app routinely contains real people. A failed request
 * echoes a plate; a render error names a visitor; a validation message
 * carries a mobile number. A diagnostics table is the last place any of
 * that should accumulate, and unlike the app's own screens it is read by
 * whoever is on triage rather than the person the data belongs to.
 *
 * So the rule is: strip on the way OUT, before anything leaves the device.
 * Not at the API, not in the database — there is no point where scrubbing
 * server-side would have prevented the data leaving the phone.
 *
 * Deliberately over-eager. A redacted stack that is slightly harder to read
 * is a far better failure than a stack carrying a patient's number, so
 * anything shaped like identifying data goes even at the cost of the odd
 * false positive.
 */
const SCRUBBERS: Array<[RegExp, string]> = [
  // Indian vehicle plates, the most common identifier in this app's errors:
  // TS09AB1234, and spaced/hyphenated variants.
  [/\b[A-Z]{2}[\s-]?\d{1,2}[\s-]?[A-Z]{1,3}[\s-]?\d{4}\b/g, '[plate]'],
  // Phone numbers: 10-digit Indian mobiles, with or without +91.
  [/(\+?91[\s-]?)?\b[6-9]\d{9}\b/g, '[phone]'],
  [/\b\d{10,}\b/g, '[number]'],
  // Anything that looks like an email.
  [/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[email]'],
  // Bearer tokens / JWTs that can appear in a network error.
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '[token]'],
  [/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [token]'],
];

export function scrub(text: string): string {
  let out = text;
  for (const [re, replacement] of SCRUBBERS) out = out.replace(re, replacement);
  return out;
}

/*
 * ── Fingerprinting ───────────────────────────────────────────────────────
 *
 * Identity is message + top frame + app version.
 *
 * Including the version is the deliberate part. The same fault in a NEW
 * release is not the same row: it is a regression, and it should surface as
 * new rather than quietly incrementing a counter someone marked resolved
 * last week.
 *
 * The message is scrubbed and then stripped of digits before hashing, so
 * "no driver for 5 min" and "no driver for 7 min" collapse into one fault
 * instead of a new row every minute.
 */
export function fingerprintOf(name: string, message: string, stack: string | undefined, appVersion: string): string {
  const topFrame = (stack ?? '')
    .split('\n')
    .map(l => l.trim())
    .find(l => l.startsWith('at ')) ?? '';

  const normalized = [
    name,
    scrub(message).replace(/\d+/g, '#'),
    scrub(topFrame).replace(/:\d+:\d+/g, ''),
    appVersion,
  ].join('|');

  // FNV-1a — a stable 32-bit hash in a few lines. No crypto dependency, and
  // this needs collision-resistance only across a handful of distinct faults,
  // not adversarial strength.
  let h = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    h ^= normalized.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function buildReport(
  err: unknown,
  ctx: {platform: 'android' | 'web'; appVersion: string; screen?: string},
): ErrorReport {
  const e = err instanceof Error ? err : new Error(String(err));
  const name = e.name || 'Error';
  const message = scrub(e.message || '').slice(0, 1000);
  const stack = e.stack ? scrub(e.stack).slice(0, 4000) : undefined;

  return {
    fingerprint: fingerprintOf(name, e.message || '', e.stack, ctx.appVersion),
    platform: ctx.platform,
    appVersion: ctx.appVersion,
    name,
    message,
    stack,
    screen: ctx.screen,
  };
}

/*
 * ── Send policy ──────────────────────────────────────────────────────────
 *
 * The backend rate-limits per fingerprint, but a wedged client should not be
 * relying on the server to stop it hammering: the phone is the one with a
 * battery and a data plan. So a fault is reported once per session, then
 * counted locally and never sent again.
 *
 * This means the server's `count` is a count of SESSIONS affected rather
 * than raw occurrences, which is the more useful number anyway — a render
 * loop firing 400 times on one phone is one broken session, not 400
 * incidents.
 */
const sentThisSession = new Set<string>();

export function shouldSend(fingerprint: string): boolean {
  if (sentThisSession.has(fingerprint)) return false;
  sentThisSession.add(fingerprint);
  return true;
}

/** Test seam — session state is module-level, so specs need a way to reset. */
export function __resetSessionForTests(): void {
  sentThisSession.clear();
}
