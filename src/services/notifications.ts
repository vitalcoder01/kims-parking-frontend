import notifee, {AndroidImportance, AndroidColor, TriggerType, TimestampTrigger, AuthorizationStatus} from '@notifee/react-native';

// Central place for OS-level (system tray) notifications.
// Works while the app is backgrounded; scheduled ones fire even when the app is fully closed.

const CHANNEL_ID = 'kims_parking';
const ALARM_CHANNEL_ID = 'kims_parking_alarm';

let channelsReady = false;

export async function initNotifications(): Promise<void> {
  // Ask for permission (Android 13+ requires POST_NOTIFICATIONS at runtime).
  await notifee.requestPermission();

  if (!channelsReady) {
    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'KIMS Parking Updates',
      importance: AndroidImportance.HIGH,
      vibration: true,
    });
    await notifee.createChannel({
      id: ALARM_CHANNEL_ID,
      name: 'KIMS Parking Alerts',
      importance: AndroidImportance.HIGH,
      vibration: true,
      vibrationPattern: [300, 500, 300, 500],
    });
    channelsReady = true;
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  const settings = await notifee.getNotificationSettings();
  return settings.authorizationStatus === AuthorizationStatus.AUTHORIZED ||
         settings.authorizationStatus === AuthorizationStatus.PROVISIONAL;
}

type Kind = 'alarm' | 'info' | 'warning';

/** Fire an OS notification immediately — shows in the tray even if the app is backgrounded. */
export async function displayNotification(title: string, body: string, kind: Kind = 'info'): Promise<void> {
  try {
    await initNotifications();
    await notifee.displayNotification({
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
