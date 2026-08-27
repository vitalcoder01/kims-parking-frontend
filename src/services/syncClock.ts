/*
 * When the app last successfully pulled everything.
 *
 * Module-level rather than context state, on purpose. "Last synced" changes
 * on every refresh and is read by exactly one surface — putting it in
 * AppStateContext would re-render every consumer in the app each time a
 * fetch landed, which is the precise churn this session was spent removing
 * (the GPS-ping re-render, the per-second clocks).
 *
 * The co-pilot already ticks on its own schedule, so it reads this on a tick
 * it was paying for anyway. Nothing subscribes; nothing re-renders.
 */

let lastSyncAt: number | null = null;
let lastSyncFailedAt: number | null = null;

/** Called by fetchAll when a full refresh commits. */
export function markSynced(): void {
  lastSyncAt = Date.now();
  lastSyncFailedAt = null;
}

/** Called when a refresh throws — the previous success time is kept. */
export function markSyncFailed(): void {
  lastSyncFailedAt = Date.now();
}

export function getSyncState(): {lastSyncAt: number | null; lastSyncFailedAt: number | null} {
  return {lastSyncAt, lastSyncFailedAt};
}

/** "just now" / "3 min ago" / "never" — minute granularity is enough here. */
export function syncAgeLabel(now: number): string {
  if (lastSyncAt == null) return 'never';
  const secs = Math.max(0, (now - lastSyncAt) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ago`;
}
