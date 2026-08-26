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

// TWO patterns, because the two APIs have genuinely different contracts and
// mixing them up is what broke every notification in 1.9.12–1.9.14:
//
//   notifee createChannel() -> validated in JS BEFORE the native call, and
//   requires an EVEN number of STRICTLY POSITIVE values (see
//   validateAndroidChannel.js -> isValidVibratePattern). An odd length or a
//   leading 0 makes createChannel THROW.
//
//   React Native Vibration.vibrate() -> first entry is an initial delay, so
//   0 is legal there and an odd length is fine.
//
// Passing the Vibration-style pattern to createChannel threw, which meant
// channelsReady never flipped, initNotifications() rejected on every call,
// and the bare catch in each caller swallowed it — so notifications AND
// vibration silently stopped working app-wide, with nothing in the logs.
// The signature rhythm: three quick taps, then one long buzz — "· · · —".
// Deliberately NOT an even pulse, because an even pulse is what every other
// app on the phone uses; an irregular rhythm is recognisable as "this is a
// KIMS job alert" from a pocket without looking. One cycle ≈ 2.3s, so it
// repeats roughly 8 times across the 20-second window.
//
// One cycle, as React Native on/off pairs (no leading delay):
//                        tap  gap  tap  gap  tap  gap  LONG  gap
const SIGNATURE_CYCLE = [250, 120, 250, 120, 250, 200, 700, 400];

// The CHANNEL pattern is one cycle only, with a positive lead-in to satisfy
// notifee's even-length/all-positive rule. This is what the SYSTEM plays
// when a notification posts — including when the app is fully killed, since
// system_server does it with no app process involved. That's the "killed ->
// notification + one buzz" behaviour, and it is guaranteed.
const CHANNEL_VIBRATION_PATTERN = [100, 250, 120, 250, 120, 250, 200, 700];

// The full ~20s pattern is built by REPEATING the cycle into one finite
// array, then played with repeat=false.
//
// This is deliberately NOT `Vibration.vibrate(cycle, true)` + a JS timer to
// stop it. RN maps repeat=true to VibrationEffect.createWaveform(pattern, 0)
// — repeat forever (VibrationModule.kt) — so that approach only ends if the
// JS timer actually fires. In the killed-app path the FCM handler starts the
// buzz and the headless task then dies, so the timer never runs and the
// phone vibrates until reboot. A finite pattern cannot run away: the OS
// plays it once and stops, in every app state.
function buildRingPattern(totalMs: number): number[] {
  const cycleMs = SIGNATURE_CYCLE.reduce((a, b) => a + b, 0);
  const reps = Math.max(1, Math.round(totalMs / cycleMs));
  const out: number[] = [0]; // RN treats entry 0 as the initial delay
  for (let i = 0; i < reps; i++) out.push(...SIGNATURE_CYCLE);
  return out;
}
const RN_VIBRATION_PATTERN = buildRingPattern(CRITICAL_RING_MS);

let channelsReady = false;

// One bad channel must never take down the others (or every other
// notification path). Isolated + logged rather than thrown: a
// misconfiguration should be loud in development, not invisible forever.
async function createChannelSafe(config: Parameters<typeof notifee.createChannel>[0]): Promise<void> {
  try {
    await notifee.createChannel(config);
  } catch (err) {
    console.warn(`[notifications] channel "${config.id}" could not be created — ` +
      'notifications on this channel will not display.', err);
  }
}

export async function initNotifications(): Promise<void> {
  // Ask for permission (Android 13+ requires POST_NOTIFICATIONS at runtime).
  try {
    await notifee.requestPermission();
  } catch (err) {
    console.warn('[notifications] requestPermission failed', err);
  }

  if (channelsReady) return;

  await createChannelSafe({
    id: CHANNEL_ID,
    name: 'KIMS Parking Updates',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
  await createChannelSafe({
    id: ALARM_CHANNEL_ID,
    name: 'KIMS Parking Alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: [300, 500, 300, 500],
  });
  await createChannelSafe({
    id: RING_CHANNEL_ID,
    name: 'KIMS Job Assignment Alarm',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: CHANNEL_VIBRATION_PATTERN,
    bypassDnd: true,
  });

  // Set regardless: the channels that DID create are usable, and retrying a
  // rejected one on every notification just burns work to fail identically.
  channelsReady = true;
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
        // OS-level self-destruct. loopSound keeps the alarm sound going
        // "until the notification is cancelled", and ongoing+autoCancel:false
        // means the user cannot swipe it away — so if the only thing that
        // ever cancelled it were a JS timer, a killed app would leave an
        // undismissable notification looping sound forever. Android cancels
        // it at this deadline whether or not any JS is still alive.
        timeoutAfter: CRITICAL_RING_MS,
      },
    });
    if (Platform.OS === 'android') {
      // repeat=false: a finite ~20s pattern that ends itself. See
      // buildRingPattern for why an infinite pattern + JS timer was unsafe.
      Vibration.vibrate(RN_VIBRATION_PATTERN, false);
    }
    // Belt-and-braces only — both the vibration and the notification now
    // terminate on their own, so nothing depends on this firing.
    if (ringTimer) clearTimeout(ringTimer);
    ringTimer = setTimeout(() => { stopAssignmentAlarm().catch(() => {}); }, CRITICAL_RING_MS);
  } catch (err) {
    // Alarms are best-effort; never crash over them — but say so, because a
    // silent catch here is exactly what hid the broken-channel bug.
    console.warn('[notifications] ringAssignmentAlarm failed', err);
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
  } catch (err) {
    // Best-effort; never crash the app over a notification — but log it.
    // A bare catch here is what let a bad channel config silently disable
    // every notification in the app with nothing to go on.
    console.warn('[notifications] displayNotification failed', err);
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
