import notifee, {AuthorizationStatus} from '@notifee/react-native';
import {getSocket} from './socket';
import {getSyncState} from './syncClock';
import {areChannelsReady} from './notifications';

/*
 * "Why am I not getting alerts?" — answered on the phone, by the person
 * holding it.
 *
 * This exists because of what actually happened here. Versions 1.9.12
 * through 1.9.14 shipped an app that looked completely healthy and alerted
 * nobody: one malformed vibration pattern made createChannel throw, a bare
 * catch swallowed it, and every notification silently stopped. Nothing on
 * screen was wrong. The only symptom was alerts that never came, which is
 * indistinguishable from a quiet shift.
 *
 * A valet cannot debug that, and neither can anyone without the phone in
 * hand. So each check below answers one question that failure raised, and
 * says which of them is broken rather than leaving "notifications don't
 * work" as the whole diagnosis.
 */

export type HealthState = 'ok' | 'warn' | 'fail' | 'checking';

export interface HealthItem {
  key: 'connection' | 'sync' | 'permission' | 'channels';
  label: string;
  state: HealthState;
  /** What this means, in the words of someone who has to act on it. */
  detail: string;
  /** Present when the app itself can do something about it. */
  fix?: 'requestPermission';
}

const MIN = 60_000;

export async function runHealthCheck(): Promise<HealthItem[]> {
  const items: HealthItem[] = [];
  const now = Date.now();

  // 1. Live connection. Without it, everything on screen is a snapshot.
  const connected = getSocket()?.connected ?? false;
  items.push({
    key: 'connection',
    label: 'Live connection',
    state: connected ? 'ok' : 'fail',
    detail: connected
      ? 'Receiving live updates.'
      : 'Not connected — the screen may be showing old information.',
  });

  // 2. Last successful refresh. Distinguishes "quiet" from "stuck": a socket
  //    can report connected while nothing has actually landed for an hour.
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

  // 3. OS permission. The first thing to go, and completely invisible in-app
  //    once denied — the app keeps posting notifications nobody ever sees.
  let permissionOk = false;
  try {
    const settings = await notifee.getNotificationSettings();
    permissionOk = settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
      || settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
  } catch {
    permissionOk = false;
  }
  items.push({
    key: 'permission',
    label: 'Notification permission',
    state: permissionOk ? 'ok' : 'fail',
    detail: permissionOk
      ? 'Alerts are allowed.'
      : 'Alerts are blocked for this app — you will not hear job assignments.',
    fix: permissionOk ? undefined : 'requestPermission',
  });

  // 4. The channels themselves. This is the exact check that would have
  //    caught 1.9.12 on the first phone it reached instead of after three
  //    releases: permission granted, app healthy, and no channel to post to.
  const channelsOk = areChannelsReady();
  items.push({
    key: 'channels',
    label: 'Alert channels',
    state: channelsOk ? 'ok' : 'fail',
    detail: channelsOk
      ? 'Alarm and alert channels are set up.'
      : 'Alert channels failed to set up — restart the app; if it persists, report it.',
  });

  return items;
}

/** Asks the OS again. Only offered when permission is the failing item. */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED
      || settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
  } catch {
    return false;
  }
}
