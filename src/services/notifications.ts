import notifee, {AndroidImportance, AndroidColor, AndroidCategory, TriggerType, TimestampTrigger, AuthorizationStatus} from '@notifee/react-native';
import {Vibration, Platform} from 'react-native';

// Central place for OS-level (system tray) notifications.
// Works while the app is backgrounded; scheduled ones fire even when the app is fully closed.

// v2: the original channels were created with no explicit `sound`, which on
// several Android builds means genuinely silent, not "plays the system
// default" — and channels are immutable after creation, so a phone that
// already has the v1 channel stays silent forever no matter what this file
// says now. Fresh ids are the only way to actually fix it for installs that
// already exist (same reason the ring channel below is already on `_v2`).
const CHANNEL_ID = 'kims_parking_v2';
const ALARM_CHANNEL_ID = 'kims_parking_alarm_v2';
// Android channels are immutable after creation — the loud full-alarm config
// (sound + bypass DND + alarm category) needs a fresh channel id on devices
// that already created the old silent-ish one. Bumped to v3 for the longer,
// more insistent vibrationPattern below (used for the app-killed case, where
// Android vibrates from the channel directly — no JS ever runs to call
// Vibration.vibrate itself); v2 installs would otherwise keep the old
// pattern forever since the channel can't be edited after creation.
const RING_CHANNEL_ID = 'kims_parking_ring_v3';
const RING_NOTIFICATION_ID = 'kims-assignment-alarm';

// A single 3-buzz/one-shot-sound burst (the old behaviour) is over in about
// 3 seconds — trivially easy to miss with the phone in a pocket or face-down
// on a desk, and nothing rings again after it. This is a real dispatch-flow
// problem, not a polish one: a valet who doesn't notice a retrieval request,
// or a driver who doesn't notice their assignment, is the entire reason jobs
// stall. Every alarm-grade alert now rings — sound AND vibration, both
// looping — for a full 20 seconds or until whatever triggered it resolves
// (accepted, reassigned, cancelled), whichever comes first. No lighter
// version for any one role: everyone gets the same aggressive alert.
const CRITICAL_RING_MS = 20000;
const CRITICAL_VIBRATION_PATTERN = [0, 700, 300, 700, 300, 700, 300];

let channelsReady = false;

export async function initNotifications(): Promise<void> {
  // Ask for permission (Android 13+ requires POST_NOTIFICATIONS at runtime).
  await notifee.requestPermission();

  if (!channelsReady) {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'KIMS Parking Updates',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
    });
    await notifee.createChannel({
      id: ALARM_CHANNEL_ID,
      name: 'KIMS Parking Alerts',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      vibrationPattern: [300, 500, 300, 500],
    });
    await notifee.createChannel({
      id: RING_CHANNEL_ID,
      name: 'KIMS Job Assignment Alarm',
      importance: AndroidImportance.HIGH,
      sound: 'default',
      vibration: true,
      vibrationPattern: CRITICAL_VIBRATION_PATTERN,
      bypassDnd: true,
    });
    channelsReady = true;
  }
}

let ringTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * The assignment/arrival/retrieval alarm — native Android notification on
 * the alarm channel (looping sound + vibration + full-screen intent when
 * locked), for the full 20-second window. Works from the FCM background
 * handler too (app killed / after reboot): there it's just the notification
 * part, which is exactly the requirement's "send the alarm like a push
 * notification" fallback.
 */
export async function ringAssignmentAlarm(title: string, body: string): Promise<void> {
  try {
    await initNotifications();
    await notifee.displayNotification({
      id: RING_NOTIFICATION_ID,
      title,
      body,
      android: {
        channelId: RING_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        category: AndroidCategory.ALARM,
        color: AndroidColor.RED,
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default', launchActivity: 'default'},
        // Rings over the lock screen like an incoming call.
        fullScreenAction: {id: 'default', launchActivity: 'default'},
        loopSound: true,
        sound: 'default',
        ongoing: true,
        autoCancel: false,
      },
    });
    if (Platform.OS === 'android') {
      // `true` repeats the pattern indefinitely — the timer below is what
      // actually bounds it to 20s, same cap that governs the ring sound.
      Vibration.vibrate(CRITICAL_VIBRATION_PATTERN, true);
    }
    if (ringTimer) clearTimeout(ringTimer);
    ringTimer = setTimeout(() => { stopAssignmentAlarm().catch(() => {}); }, CRITICAL_RING_MS);
  } catch {
    // Alarms are best-effort; never crash over them.
  }
}

/** Stop the vibration loop + dismiss the ongoing alarm notification. */
export async function stopAssignmentAlarm(): Promise<void> {
  try {
    if (ringTimer) { clearTimeout(ringTimer); ringTimer = null; }
    Vibration.cancel();
    await notifee.cancelNotification(RING_NOTIFICATION_ID);
  } catch {
    // ignore
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  const settings = await notifee.getNotificationSettings();
  return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
         settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
}

type Kind = 'alarm' | 'info' | 'warning';

/** Fire an OS notification immediately — shows in the tray even if the app is backgrounded. */
/**
 * One tray notification per event.
 *
 * `notifId` is the server's Notification row id, carried by BOTH delivery
 * paths — the socket's notification:new and the FCM push. Without it notifee
 * generated a fresh id per call, so a phone that received both (which is
 * every foreground phone, since FCM's onMessage fires alongside the socket)
 * showed the same message twice and buzzed twice. The alarm path never had
 * this problem because it always used a fixed id.
 *
 * `onlyAlertOnce` is what makes the SECOND arrival silent: it updates the
 * existing notification in place instead of re-alerting. One banner, one
 * vibration, whichever path happens to win the race.
 */
export async function displayNotification(
  title: string,
  body: string,
  kind: Kind = 'info',
  notifId?: string | number,
): Promise<void> {
  try {
    await initNotifications();
    await notifee.displayNotification({
      ...(notifId != null ? {id: `kims-notif-${notifId}`} : {}),
      title,
      body,
      android: {
        channelId: kind === 'alarm' ? ALARM_CHANNEL_ID : CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        color: kind === 'alarm' ? AndroidColor.RED : '#1E3A8A',
        smallIcon: 'ic_launcher',
        pressAction: {id: 'default'},
        // Alarm-type notifications stay until dismissed; info auto-cancels.
        autoCancel: true,
        // Vibration comes from the channel; this stops the duplicate delivery
        // from buzzing a second time for something already on screen.
        onlyAlertOnce: true,
      },
    });
  } catch {
    // Notifications are best-effort; never crash the app over them.
  }
}

/**
 * Schedule an OS notification for a future time.
 * Fires even when the app is completely closed — the Android OS holds the trigger.
 * Returns the notification id so it can be cancelled if the user changes plans.
 */
export async function scheduleNotification(
  title: string,
  body: string,
  fireAtMs: number,
  kind: Kind = 'alarm',
): Promise<string | null> {
  try {
    await initNotifications();
    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: fireAtMs,
    };
    const id = await notifee.createTriggerNotification(
      {
        title,
        body,
        android: {
          channelId: kind === 'alarm' ? ALARM_CHANNEL_ID : CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          color: kind === 'alarm' ? AndroidColor.RED : '#1E3A8A',
          smallIcon: 'ic_launcher',
          pressAction: {id: 'default'},
        },
      },
      trigger,
    );
    return id;
  } catch {
    return null;
  }
}

export async function cancelNotification(id: string): Promise<void> {
  try {
    await notifee.cancelNotification(id);
  } catch {
    // ignore
  }
}
