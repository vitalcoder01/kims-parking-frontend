// FCM push wiring — the delivery path that still works when the app is
// killed or the phone has been rebooted (Android redelivers high-priority
// pushes after boot and wakes the background handler, which raises the full
// native alarm notification).
//
// Everything is guarded: until google-services.json is added to
// android/app/, @react-native-firebase's native module is absent and every
// function here silently no-ops — sockets + notifee still cover the
// foreground/background (not killed) cases.
import {notificationsApi} from './api';
import {ringAssignmentAlarm, displayNotification, stopAssignmentAlarm} from './notifications';

type MessagingModule = any;

let messagingFn: MessagingModule | null | undefined;

function getMessaging(): MessagingModule | null {
  if (messagingFn !== undefined) return messagingFn;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    messagingFn = require('@react-native-firebase/messaging').default;
    // Throws if the native Firebase app isn't configured (no google-services.json).
    messagingFn();
  } catch {
    messagingFn = null;
  }
  return messagingFn;
}

/**
 * Show the right notification for an incoming FCM message.
 *
 * `fromBackground` matters. Non-alarm pushes now carry a `notification` block
 * so Android renders them itself even when the app is killed — but the system
 * only does that while the app is NOT in the foreground. So:
 *
 *   background + notification block -> Android already showed it; showing it
 *                                      again here would be the same message
 *                                      twice, side by side.
 *   background + data only (alarm)  -> nothing was shown; raise the alarm.
 *   foreground                      -> the system never renders, so we always
 *                                      show it ourselves.
 */
export async function handleRemoteMessage(
  remoteMessage: any,
  {fromBackground = false}: {fromBackground?: boolean} = {},
): Promise<void> {
  const data = remoteMessage?.data ?? {};
  const title = data.title ?? remoteMessage?.notification?.title ?? 'KIMS Parking';
  const body = data.body ?? remoteMessage?.notification?.body ?? '';

  // The assignment was rolled back while this phone was unreachable, so the
  // `assignment:cancelled` socket event never arrived — this push is the only
  // thing that can reach it. Kill the alarm first: it is an `ongoing`
  // notification the user cannot swipe away, and it is ringing about a job
  // that no longer exists. The server sends this on the assignment's own tray
  // tag, so the accompanying notice also replaces the original entry.
  if (data.kind === 'assignment-cancelled') {
    await stopAssignmentAlarm();
    // Fall through: the replacement notice still gets displayed below unless
    // Android already rendered it (background + notification block).
  }

  if (data.type === 'alarm') {
    // notifId is the server's own row id and rides BOTH delivery paths, so
    // the socket and the push collapse onto one ring instead of two.
    await ringAssignmentAlarm(
      title, body,
      data.notifId ? String(data.notifId) : undefined,
      data.alarmLevel === 'long' ? 'long' : 'short',
    );
    return;
  }
  if (fromBackground && remoteMessage?.notification) return;
  // notifId is set by the backend for every notification it raises — the
  // socket path uses the same value, so whichever arrives second updates
  // the first in place rather than stacking a duplicate.
  await displayNotification(title, body, (data.type as any) ?? 'info', data.notifId);
}

/**
 * Registered from index.js — MUST happen outside any component so Android
 * can invoke it with the app killed (and re-arm after reboot).
 */
export function registerBackgroundPushHandler(): void {
  const messaging = getMessaging();
  if (!messaging) return;
  messaging().setBackgroundMessageHandler(async (remoteMessage: any) => {
    await handleRemoteMessage(remoteMessage, {fromBackground: true});
  });
}

/**
 * Called after login: get this device's FCM token, register it with the
 * backend, keep it fresh on rotation, and ring on foreground pushes too
 * (socket usually beats FCM in the foreground — the alarm notification id is
 * stable, so double delivery just refreshes the same alarm instead of
 * stacking two).
 */
export async function initPushMessaging(): Promise<() => void> {
  const messaging = getMessaging();
  if (!messaging) return () => {};

  try {
    await messaging().requestPermission();
    const token = await messaging().getToken();
    if (token) await notificationsApi.registerDevice(token).catch(() => {});
  } catch {
    return () => {};
  }

  const unsubToken = messaging().onTokenRefresh((token: string) => {
    notificationsApi.registerDevice(token).catch(() => {});
  });
  const unsubMessage = messaging().onMessage(async (remoteMessage: any) => {
    await handleRemoteMessage(remoteMessage);
  });

  return () => {
    unsubToken();
    unsubMessage();
  };
}

/**
 * Called on logout, while the session token is still valid — drops this
 * device's registration so it stops receiving the signed-out account's
 * pushes instead of staying bound to it until someone else logs in here.
 */
export async function unregisterCurrentDevice(): Promise<void> {
  const messaging = getMessaging();
  if (!messaging) return;
  try {
    const token = await messaging().getToken();
    if (token) await notificationsApi.unregisterDevice(token);
  } catch {
    // Best-effort — never block logout over this.
  }
}
