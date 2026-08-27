import {useState, useEffect, useMemo, useCallback, useRef} from 'react';
import {AppState as RNAppState} from 'react-native';
import {useAppState} from '../../context/AppStateContext';
import {useAuth} from '../../context/AuthContext';
import {getSocket} from '../../services/socket';
import {selectInsights, Insight, CopilotRole} from '../../core/copilot/insights';
import type {CreatureMood} from './Creature';

/*
 * Feeds the creature.
 *
 * ── Why this ticks, and why slowly ───────────────────────────────────────
 *
 * Most rules are elapsed-time rules ("no driver for over 5 min"), so they
 * become true while nothing else changes and no re-render would otherwise
 * happen. Something has to re-evaluate them on a clock.
 *
 * 15s, not 1s. Every threshold in the engine is minutes; a per-second tick
 * would re-run the rules sixty times to change an answer once, which is the
 * exact waste this session removed from the valet and doctor screens. The
 * cost of being at most fifteen seconds late to say "nobody has picked this
 * up for five minutes" is nothing.
 *
 * The tick stops when the app is backgrounded. A co-pilot recomputing
 * staffing ratios in a pocket helps nobody and costs battery.
 *
 * Connection state is read from the socket here rather than lifted into
 * AppStateContext, deliberately: adding a value there would re-render every
 * consumer in the app on every connect/disconnect, and this session was
 * largely spent removing exactly that kind of churn. Polling it on a tick we
 * are already paying for is free.
 */

const TICK_MS = 15_000;

export interface CopilotState {
  insights: Insight[];
  top: Insight | null;
  mood: CreatureMood;
  dismiss: (id: string) => void;
  /** True when the surface should stay hidden entirely (unsupported role). */
  disabled: boolean;
}

export function useCopilot(): CopilotState {
  const {user} = useAuth();
  const {tasks, visitors, drivers, hydrated} = useAppState();

  const [now, setNow] = useState(() => Date.now());
  const [active, setActive] = useState(true);
  /*
   * Dismissals are keyed by insight id, which the engine builds from the
   * situation rather than the render — so dismissing "these 3 cars are
   * stale" stays dismissed across re-renders, but a fourth car going stale
   * produces a new id and speaks up again. That is the behaviour you want:
   * silencing a fact, not silencing a rule forever.
   *
   * Session-scoped on purpose. Persisting dismissals across restarts would
   * mean a valet who waved something away this morning is never told again
   * about a car still sitting there this afternoon.
   */
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const prevTopId = useRef<string | null>(null);
  const [mood, setMood] = useState<CreatureMood>('idle');

  useEffect(() => {
    const sub = RNAppState.addEventListener('change', s => setActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const iv = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(iv);
  }, [active]);

  const role = user?.role as CopilotRole | undefined;
  const disabled = !role || !['valet', 'admin', 'driver', 'doctor', 'staff'].includes(role);

  const insights = useMemo(() => {
    if (disabled || !role) return [];
    return selectInsights({
      role,
      userId: user?.id,
      driverId: user?.linkedDriverId ?? null,
      tasks,
      visitors,
      drivers,
      connected: getSocket()?.connected ?? false,
      hydrated,
      now,
    }).filter(i => !dismissed.has(i.id));
  }, [disabled, role, user?.id, user?.linkedDriverId, tasks, visitors, drivers, hydrated, now, dismissed]);

  const top = insights[0] ?? null;

  /*
   * Mood follows the insights, with one deliberate asymmetry: it hops only
   * when the TOP insight changes identity, not whenever one merely exists.
   * Without that it would hop on every tick for as long as a situation
   * lasted, which is how a character stops being noticed.
   */
  useEffect(() => {
    const id = top?.id ?? null;
    if (id && id !== prevTopId.current) {
      setMood('noticing');
      const t = setTimeout(() => setMood('idle'), 1200);
      prevTopId.current = id;
      return () => clearTimeout(t);
    }
    if (!id) {
      // Nothing to report: settle. Both branches of this were 'asleep' —
      // it read as though foreground and background differed here and they
      // never did. The distinction that does matter (stop ticking when
      // backgrounded) is handled by the tick effect above.
      prevTopId.current = null;
      setMood('asleep');
    }
  }, [top?.id]);

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  return {insights, top, mood, dismiss, disabled};
}
