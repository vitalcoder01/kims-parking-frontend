import notifee, {AuthorizationStatus, AndroidImportance} from '@notifee/react-native';
import {getSocket} from './socket';
import {getSyncState} from './syncClock';
import {areChannelsReady, RING_CHANNEL_ID, EXPECTED_RING_VIBRATION_MS} from './notifications';

/*
 * "Why didn't I get the alarm?" — answered on the phone, by the person
 * holding it.
 *
 * This is the co-pilot's most valuable job, and it exists because every
 * notification failure this app has had was INVISIBLE. Nothing on screen is
 * ever wrong when alerts stop: the app looks healthy, jobs appear, buttons
 * work, and the only symptom is silence — which is indistinguishable from a
 * quiet shift until someone misses a retrieval.
 *
 * Three real failures so far, and each is a check below:
 *
 *   1.9.12  a malformed vibration pattern made createChannel throw, a bare
 *           catch swallowed it, and every notification silently stopped.
 *           -> "Alert channels"
 *
 *   1.9.17  the app moved its ring channel to _v3 while the backend and the
 *           manifest still targeted _v2, so the killed-state alarm was
 *           posted to a channel the device had never created.
 *           -> "Alarm channel" verifies the channel EXISTS by its real id
 *
 *   ongoing the 20s buzz lived in JS, so backgrounded and killed phones got
 *           two seconds.
 *           -> "Alarm channel" also verifies the pattern is actually ~20s
 *
 * And the one that is not a bug at all but causes more missed alarms in
 * practice than all of them combined: OEM battery optimisation. Xiaomi, Oppo,
 * Vivo and Samsung aggressively kill background apps and drop FCM, and the
 * user is never told. It cannot be fixed in code — only detected, explained,
 * and the settings screen opened.
 */

export type HealthState = 'ok' | 'warn' | 'fail' | 'checking';

export interface HealthItem {
  key: 'connection' | 'sync' | 'permission' | 'channels' | 'ringChannel' | 'battery' | 'power';
  label: string;
  state: HealthState;
  /** What this means, in the words of someone who has to act on it. */
  detail: string;
  /** Present when the app can do something about it, or open the right screen. */
  fix?: 'requestPermission' | 'openNotificationSettings' | 'openBatterySettings' | 'openPowerSettings';
}

const MIN = 60_000;

export async function runHealthCheck(): Promise<HealthItem[]> {
  const items: HealthItem[] = [];
  const now = Date.now();

  // ── Live connection ─────────────────────────────────────────────────────
  const connected = getSocket()?.connected ?? false;
  items.push({
    key: 'connection',
    label: 'Live connection',
    state: connected ? 'ok' : 'fail',
    detail: connected
      ? 'Receiving live updates.'
      : 'Not connected — the screen may be showing old information.',
  });

  // ── Last successful refresh ─────────────────────────────────────────────
  // Separates "quiet" from "stuck": a socket can report connected while
  // nothing has actually landed for an hour.
  const {lastSyncAt, lastSyncFailedAt} = getSyncState();
  const age = lastSyncAt == null ? null : now - lastSyncAt;
  items.push({
    key: 'sync',
    label: 'Last refresh',
    state: age == null ? 'warn' : age > 10 * MIN ? 'warn' : 'ok',
    detail: age == null
      ? 'Nothing has loaded yet this session.'
      : `${Math.max(1, Math.round(age / MIN))} min ago${lastSyncFailedAt ? ' — the last attempt failed.' : '.'}`,
  });

  // ── OS permission ───────────────────────────────────────────────────────
  let permissionOk = false;
  try {
    const settings = await notifee.getNotificationSettings();
    permissionOk = settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
      || settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
  } catch { /* treated as denied */ }
  items.push({
    key: 'permission',
    label: 'Notification permission',
    state: permissionOk ? 'ok' : 'fail',
    detail: permissionOk
      ? 'Alerts are allowed.'
      : 'Alerts are blocked for this app — you will not hear job assignments.',
    fix: permissionOk ? undefined : 'requestPermission',
  });

  // ── Channels created at all ─────────────────────────────────────────────
  items.push({
    key: 'channels',
    label: 'Alert channels',
    state: areChannelsReady() ? 'ok' : 'fail',
    detail: areChannelsReady()
      ? 'Channels were set up on launch.'
      : 'Channels failed to set up — restart the app; if it persists, report it.',
  });

  /*
   * ── The alarm channel, inspected for real ──────────────────────────────
   *
   * Not "did we call createChannel" but "what does the device actually have
   * under that id". This is the check that catches every failure the alarm
   * has ever had, because it reads back the channel Android is really using:
   * a wrong id shows up as missing, a stale channel shows up with the old
   * short pattern, and a user who muted the channel shows up as blocked —
   * none of which the app can otherwise see.
   */
  try {
    const ch = await notifee.getChannel(RING_CHANNEL_ID);
    if (!ch) {
      items.push({
        key: 'ringChannel',
        label: 'Alarm channel',
        state: 'fail',
        detail: `Missing on this device (${RING_CHANNEL_ID}). Alarms sent while the app is closed have nowhere to land.`,
        fix: 'openNotificationSettings',
      });
    } else if (ch.blocked) {
      items.push({
        key: 'ringChannel',
        label: 'Alarm channel',
        state: 'fail',
        detail: 'Turned off in Android settings — alarms will never make a sound.',
        fix: 'openNotificationSettings',
      });
    } else {
      const patternMs = (ch.vibrationPattern ?? []).reduce((a, b) => a + b, 0);
      // Anything materially short means this device is holding an older
      // channel: channels are immutable, so a phone that created _v3 keeps
      // its 2s pattern forever no matter what this build ships.
      const patternOk = patternMs >= EXPECTED_RING_VIBRATION_MS * 0.8;
      const importanceOk = ch.importance === AndroidImportance.HIGH;
      items.push({
        key: 'ringChannel',
        label: 'Alarm channel',
        state: patternOk && importanceOk ? 'ok' : 'warn',
        detail: !importanceOk
          ? 'Importance was lowered in Android settings — alarms may not ring or show over other apps.'
          : patternOk
            ? `Ready — ${Math.round(patternMs / 1000)}s alarm buzz, plays even with the app closed.`
            : `This phone still has an older ${Math.round(patternMs / 1000)}s alarm. Reinstalling the app recreates it at ${Math.round(EXPECTED_RING_VIBRATION_MS / 1000)}s.`,
        fix: importanceOk ? undefined : 'openNotificationSettings',
      });
    }
  } catch {
    items.push({
      key: 'ringChannel',
      label: 'Alarm channel',
      state: 'warn',
      detail: 'Could not read the alarm channel on this device.',
    });
  }

  /*
   * ── Battery optimisation ───────────────────────────────────────────────
   *
   * In practice this causes more missed alarms than every bug above put
   * together, and it is completely silent. With the app optimised, Android
   * (and far more aggressively, Xiaomi/Oppo/Vivo/Samsung) delays or drops
   * high-priority FCM to a killed app — so the one delivery path that is
   * supposed to survive being force-closed simply does not arrive.
   *
   * Nothing in the app can override it. It can only be detected, explained
   * in terms of the consequence, and the right settings screen opened.
   */
  try {
    const optimised = await notifee.isBatteryOptimizationEnabled();
    items.push({
      key: 'battery',
      label: 'Battery optimisation',
      state: optimised ? 'warn' : 'ok',
      detail: optimised
        ? 'On for this app — Android may delay or drop alarms while the app is closed. Turn it off to be sure of hearing jobs.'
        : 'Off — alarms can reach this phone with the app closed.',
      fix: optimised ? 'openBatterySettings' : undefined,
    });
  } catch { /* not available on this OS build */ }

  // ── OEM power manager (Xiaomi/Oppo/Vivo/Huawei "autostart") ────────────
  // A separate, stricter layer than Android's own battery optimisation, and
  // the usual reason an alarm works on one phone and not the identical model
  // next to it.
  try {
    const info = await notifee.getPowerManagerInfo();
    if (info?.activity) {
      items.push({
        key: 'power',
        label: 'Auto-start restriction',
        state: 'warn',
        detail: `${info.manufacturer ?? 'This phone'} restricts apps from starting in the background. Allow auto-start, or alarms may not arrive when the app is closed.`,
        fix: 'openPowerSettings',
      });
    }
  } catch { /* no OEM restriction on this device */ }

  return items;
}

export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
      || settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}

/** Opens whichever settings screen the failing item points at. */
export async function applyFix(fix: NonNullable<HealthItem['fix']>): Promise<void> {
  try {
    switch (fix) {
      case 'requestPermission':        await requestNotificationPermission(); break;
      case 'openNotificationSettings': await notifee.openNotificationSettings(RING_CHANNEL_ID); break;
      case 'openBatterySettings':      await notifee.openBatteryOptimizationSettings(); break;
      case 'openPowerSettings':        await notifee.openPowerManagerSettings(); break;
    }
  } catch {
    // Some OEM builds have no such screen to open. Nothing useful to say.
  }
}
