import notifee, {AndroidImportance, AndroidColor, AndroidCategory, TriggerType, TimestampTrigger, AuthorizationStatus} from '@notifee/react-native';
import {Vibration} from 'react-native';

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
// Android channels are IMMUTABLE once created — a device that already made
// an older id keeps that id's sound and vibration forever, whatever this
// file says. So every change to the ring behaviour needs a fresh id.
//
// v4 carries the full ~20s vibration pattern. Up to v3 the channel held a
// single ~2s cycle and the 20 seconds came from a JS Vibration.vibrate()
// call, which needs the app's JS thread — so backgrounded and killed phones
// only ever buzzed for two seconds. Moving the whole pattern onto the
// channel is what makes the alarm identical in all three app states.
//
// This id MUST match, exactly:
//   - push.service.js  fallbackMessage.android.notification.channelId
//   - AndroidManifest  com.google.firebase.messaging.default_notification_channel_id
// They were left on _v2 while this moved to _v3, which meant the
// killed-state alarm was posted to a channel that did not exist on the
// device — dropped or demoted to system defaults by Android.
/**
 * Exported so the co-pilot's health check can read the channel BACK from the
 * device rather than trust that createChannel was called. That readback is
 * what catches a stale channel (immutable, so an old install keeps its old
 * pattern forever) and a wrong id — the exact fault that broke the
 * killed-state alarm.
 */
export const RING_CHANNEL_ID = 'kims_parking_ring_v4';

/**
 * The short alarm — everything that is not someone waiting on you.
 *
 * A 20-second ring is the right answer to a doctor standing at the desk. It
 * is the wrong answer to "this job still needs a driver", which is a
 * reminder about something the valet already knows and which repeats. Twenty
 * seconds of buzzing for that teaches people to ignore the sound, and what
 * they then miss is the alert that mattered.
 *
 * Duration is a property of the CHANNEL on Android — the system plays the
 * channel's pattern, and channels are immutable — so two ring lengths means
 * two channels. There is no way to vary it per notification.
 */
export const RING_SHORT_CHANNEL_ID = 'kims_parking_ring_short_v1';
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
/** The reminder-grade ring. Matches SHORT_VIBRATION_PATTERN's real length. */
const SHORT_RING_MS = 7000;

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

// THE CHANNEL PATTERN IS THE ALARM. Nothing else is.
//
// This is what system_server plays when a notification posts on this
// channel, with no app process involved — so it is the ONLY mechanism that
// works identically whether the app is open, backgrounded, or force-killed.
//
// It used to be a single ~2s cycle, and that was the whole bug: the 20
// seconds lived in a JS Vibration.vibrate() call that needs the app's JS
// thread, so 20s only ever happened with the app open. Backgrounded and
// killed both got two seconds, which is what "the vibration only works when
// the app is open" actually meant.
//
// Nine repeats of the signature cycle: 72 entries, 20,610ms. Even-length and
// all strictly positive, which is what notifee's isValidVibratePattern
// demands — violating that is what made createChannel throw in 1.9.12 and
// silently disabled every notification in the app.
function repeatCycle(reps: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < reps; i++) out.push(...SIGNATURE_CYCLE);
  return out;
}
const CHANNEL_VIBRATION_PATTERN = repeatCycle(9);
// Three cycles ≈ 6.9s — the same signature rhythm, so it is still
// recognisable as a KIMS alert, just over quickly.
const SHORT_VIBRATION_PATTERN = repeatCycle(3);

/** How long the alarm buzz should actually last — the health check compares
 *  the device's real channel against this to spot a stale one. */
export const EXPECTED_RING_VIBRATION_MS =
  CHANNEL_VIBRATION_PATTERN.reduce((a, b) => a + b, 0);

// There is deliberately NO JS-side vibration any more.
//
// ringAssignmentAlarm used to post the notification (which makes the channel
// vibrate) and then ALSO call Vibration.vibrate() with a ~20s waveform.
// Android runs one vibration at a time: whichever of those two started last
// cancelled the other, which is why the foreground buzz cut out early and
// unpredictably. Two sources for one vibrator is not something to tune — it
// is something to remove.
//
// With the pattern on the channel, every app state now takes the identical
// code path through system_server, and there is nothing left that behaves
// differently depending on whether JS happens to be alive.

let channelsReady = false;

/**
 * Whether the notification channels were actually created.
 *
 * Exposed for the co-pilot's health check, and this is the exact flag whose
 * silent failure caused 1.9.12-1.9.14 to alert nobody: one malformed
 * vibration pattern made createChannel throw, a bare catch swallowed it,
 * this stayed false, and every notification quietly went nowhere while the
 * app looked perfectly healthy. Being able to read it on the phone is the
 * difference between diagnosing that in a minute and diagnosing it in three
 * releases.
 */
export function areChannelsReady(): boolean {
  return channelsReady;
}

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
    name: 'Car requested / arrival (20s)',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: CHANNEL_VIBRATION_PATTERN,
    bypassDnd: true,
  });
  // Named so the two are distinguishable in Android's own settings — a user
  // who finds the long one too much can mute it without silencing every
  // alert the app has.
  await createChannelSafe({
    id: RING_SHORT_CHANNEL_ID,
    name: 'Reminders (6s)',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
    vibrationPattern: SHORT_VIBRATION_PATTERN,
    bypassDnd: true,
  });

  // Set regardless: the channels that DID create are usable, and retrying a
  // rejected one on every notification just burns work to fail identically.
  channelsReady = true;
}

let ringTimer: ReturnType<typeof setTimeout> | null = null;

/*
 * Which alarm is already ringing, and when it started.
 *
 * Without this, reopening the app re-rang the alarm every time: the socket
 * replays notification:new on reconnect and the FCM foreground handler may
 * deliver the same event again, so a valet who backgrounded the app and came
 * straight back got buzzed a second time for a job they had already been
 * told about. That is the "if I open the app immediately it triggers again"
 * behaviour.
 *
 * Keyed by the event's own id so a genuinely NEW assignment always rings.
 * The window is the ring length: past it the alarm is over, and the same job
 * alerting again is a real re-notification rather than an echo.
 */
let lastRing: {key: string; at: number} | null = null;

/**
 * The assignment/arrival/retrieval alarm — native Android notification on
 * the alarm channel (looping sound + vibration + full-screen intent when
 * locked), for the full 20-second window. Works from the FCM background
 * handler too (app killed / after reboot): there it's just the notification
 * part, which is exactly the requirement's "send the alarm like a push
 * notification" fallback.
 */
export async function ringAssignmentAlarm(
  title: string,
  body: string,
  /**
   * Stable id for the event being alarmed about — the server's notification
   * row id, carried identically by the socket and the FCM push. Omitted, the
   * title+body is used, which still collapses the common duplicate.
   */
  eventKey?: string,
  /**
   * 'long' (~20s) is reserved for someone actually waiting on the recipient:
   * a retrieval request, an arrival heads-up, or a driver's own assignment.
   * Everything else is 'short' (~7s). Defaults to short so an alert added
   * later cannot accidentally inherit the loudest behaviour in the app.
   */
  level: 'long' | 'short' = 'short',
): Promise<void> {
  try {
    const key = eventKey ?? `${title}|${body}`;
    const now = Date.now();
    const window = level === 'long' ? CRITICAL_RING_MS : SHORT_RING_MS;
    if (lastRing && lastRing.key === key && now - lastRing.at < window) {
      // Same event, still inside its own ring window — this is the socket and
      // the push both arriving, or the app being reopened. Already ringing.
      return;
    }
    lastRing = {key, at: now};

    await initNotifications();
    await notifee.displayNotification({
      id: RING_NOTIFICATION_ID,
      title,
      body,
      android: {
        channelId: level === 'long' ? RING_CHANNEL_ID : RING_SHORT_CHANNEL_ID,
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
        // Must track the LEVEL. The notification is ongoing and cannot be
        // swiped away, so a short alarm using the long deadline would leave
        // an undismissable entry sitting there for 20s after a 7s buzz.
        timeoutAfter: level === 'long' ? CRITICAL_RING_MS : SHORT_RING_MS,
      },
    });
    // Belt-and-braces only — both the vibration and the notification now
    // terminate on their own, so nothing depends on this firing.
    if (ringTimer) clearTimeout(ringTimer);
    ringTimer = setTimeout(() => { stopAssignmentAlarm().catch(() => {}); },
      level === 'long' ? CRITICAL_RING_MS : SHORT_RING_MS);
  } catch (err) {
    // Alarms are best-effort; never crash over them — but say so, because a
    // silent catch here is exactly what hid the broken-channel bug.
    console.warn('[notifications] ringAssignmentAlarm failed', err);
  }
}

/**
 * Dismiss the alarm notification and stop its sound.
 *
 * Vibration.cancel() is best-effort. The buzz now comes from the channel, so
 * it is system_server playing it — attributed to this app, so cancelling
 * usually does stop it, but only while this app's process is alive to make
 * the call. A killed phone rings out the full pattern regardless, which is
 * the correct trade: a guaranteed 20s alarm that occasionally overruns its
 * reason by a few seconds is far better than one that silently does not
 * fire at all.
 */
export async function stopAssignmentAlarm(): Promise<void> {
  try {
    // Clear the dedupe key too: once an alarm has been resolved, the same
    // job alerting again is a real event, not an echo of this one.
    lastRing = null;
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
