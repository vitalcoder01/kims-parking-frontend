import React, {useState, useEffect} from 'react';
import {Text, StyleProp, TextStyle} from 'react-native';
import {ParkingTask} from '../context/AppStateContext';
import {enRouteSeconds, fmtDuration} from '../utils/retrievalClocks';

/**
 * "on the way 4:12" — the one place in the valet's screen that genuinely
 * needs a per-second clock.
 *
 * It owns that clock itself, which is the entire point. The screen used to
 * hold a single `now` ticking every second so this label could count, and
 * every other time-derived value on the screen — "5 min ago", "45 MIN",
 * the urgency sort — was dragged along with it. Those are all
 * minute-granularity, so 59 of every 60 renders of a very large screen
 * produced byte-identical output.
 *
 * Isolating the second-hand here means the screen can tick slowly and only
 * this small subtree re-renders each second.
 */
export function EnRouteTimer({task, style}: {task: ParkingTask; style?: StyleProp<TextStyle>}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const secs = enRouteSeconds(task, now);
  if (secs == null) return null;
  return <Text style={style}>on the way {fmtDuration(secs)}</Text>;
}
