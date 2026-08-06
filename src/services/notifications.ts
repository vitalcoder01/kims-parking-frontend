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
// that already created the old silent-ish one.
const RING_CHANNEL_ID = 'kims_parking_ring_v2';
const RING_NOTIFICATION_ID = 'kims-assignment-alarm';

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
      vibrationPattern: [300, 600, 300, 600],
      bypassDnd: true,
    });
    channelsReady = true;
  }
}

/**
 * The driver assignment alarm — native Android notification on the alarm
 * channel (sound + vibration + full-screen intent when locked), plus an
 * in-process vibration loop when we're actually running in the foreground.
 * Works from the FCM background handler too (app killed / after reboot):
 * there it's just the notification part, which is exactly the requirement's
 * "send the alarm like a push notification" fallback.
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
        // 3 rings, not an indefinite loop — still gets attention without
        // ringing forever if nobody's near the phone to dismiss it.
        loopSound: false,
        sound: 'default',
        ongoing: true,
        autoCancel: false,
      },
    });
    if (Platform.OS === 'android') {
      // Fixed-length pattern (3 buzzes), not an infinite repeat — same
      // "insistent but bounded" behaviour as the sound above.
      Vibration.vibrate([0, 600, 400, 600, 400, 600, 400], false);
    }
  } catch {
    // Alarms are best-effort; never crash over them.
  }
}

/** Stop the vibration loop + dismiss the ongoing alarm notification. */
export async function stopAssignmentAlarm(): Promise<void> {
  try {
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
