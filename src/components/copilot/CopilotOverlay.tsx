import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, View, Text, StyleSheet, Dimensions, Keyboard, Platform} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '../../context/ThemeContext';
import {PressableScale} from '../PressableScale';
import {Icon} from '../Icon';
import {Creature} from './Creature';
import {useCopilot} from './useCopilot';
import {CopilotPanel} from './CopilotPanel';
import type {Insight} from '../../core/copilot/insights';

/*
 * Where the creature is allowed to be, and when it is allowed to move.
 *
 * ── The roaming rule ─────────────────────────────────────────────────────
 *
 * It wanders only on an idle screen. Everywhere else it sits in its corner
 * and stays there.
 *
 * This is the one constraint worth defending, because the appeal of a
 * roaming character and the job of this app are in direct tension. A valet
 * is racing a departure deadline and reading a number plate; a character
 * drifting across that is covering the thing they are trying to read, at the
 * moment they are trying to read it. That is precisely why Clippy is
 * remembered the way it is — not for being a character, but for interrupting
 * focused work.
 *
 * So `canRoam` must be true on ALL counts:
 *
 *   - the host screen declared itself idle (a dashboard, not a form)
 *   - nothing critical is being reported (that pins it beside its message)
 *   - the keyboard is closed
 *   - nobody has touched the screen for IDLE_BEFORE_ROAM_MS
 *
 * Fail any one and it returns to the corner. It wanders while a driver waits
 * between jobs; it never wanders while a valet types a plate.
 */

const IDLE_BEFORE_ROAM_MS = 20_000;
const ROAM_STEP_MS = 4200;
const SIZE = 46;
const MARGIN = 16;

interface Props {
  /**
   * Whether the current screen is a place worth wandering. Host screens opt
   * IN — the default is stillness, so a screen added later cannot
   * accidentally inherit a roaming mascot.
   */
  idleScreen?: boolean;
  /** Where an insight's action should take the user. */
  onNavigate?: (insight: Insight) => void;
}

export function CopilotOverlay({idleScreen = false, onNavigate}: Props) {
  const {colors} = useTheme();
  const insets = useSafeAreaInsets();
  const {insights, top, mood, dismiss, disabled} = useCopilot();

  const [expanded, setExpanded] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [idleSince, setIdleSince] = useState(() => Date.now());
  const [canRoam, setCanRoam] = useState(false);

  const pos = useRef(new Animated.ValueXY({x: 0, y: 0})).current;

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardUp(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardUp(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Any new insight resets the idle clock — something just happened, so this
  // is not a quiet moment even if nobody has touched the screen.
  useEffect(() => { setIdleSince(Date.now()); }, [top?.id]);

  useEffect(() => {
    const allowed = idleScreen && !keyboardUp && !expanded && top?.severity !== 'critical';
    if (!allowed) { setCanRoam(false); return; }
    const t = setTimeout(() => setCanRoam(true), IDLE_BEFORE_ROAM_MS);
    return () => clearTimeout(t);
  }, [idleScreen, keyboardUp, expanded, top?.severity, idleSince]);

  /*
   * The wander itself.
   *
   * Confined to a band down the right edge rather than the whole screen: it
   * reads as alive without ever crossing the middle, where content lives.
   * Slow easing on purpose — quick movement in peripheral vision reads as an
   * alert and pulls the eye, which is the opposite of what an idle animation
   * should do.
   */
  useEffect(() => {
    if (!canRoam) {
      Animated.spring(pos, {toValue: {x: 0, y: 0}, friction: 7, useNativeDriver: true}).start();
      return;
    }
    let cancelled = false;
    const {height} = Dimensions.get('window');
    const band = Math.max(120, height * 0.34);

    const step = () => {
      if (cancelled) return;
      Animated.timing(pos, {
        toValue: {x: -(Math.random() * 46), y: -(Math.random() * band)},
        duration: ROAM_STEP_MS,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }).start(({finished}) => { if (finished && !cancelled) step(); });
    };
    step();
    return () => { cancelled = true; pos.stopAnimation(); };
  }, [canRoam, pos]);

  if (disabled) return null;
  /*
   * Rendered even with nothing to report. The earlier version hid itself on
   * non-idle screens when quiet, which also hid the panel — and the panel is
   * most of the value. It is dimmed and breathing slowly when idle, so it
   * costs a corner rather than attention.
   */
  if (keyboardUp) return null;

  const sev = top?.severity ?? null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        s.root,
        {
          right: MARGIN,
          bottom: MARGIN + insets.bottom,
          transform: pos.getTranslateTransform(),
        },
      ]}
    >
      {expanded && top && (
        <View style={[s.bubble, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          <Text style={[s.msg, {color: colors.textPrimary}]}>{top.message}</Text>
          <View style={s.bubbleRow}>
            <PressableScale
              onPress={() => { dismiss(top.id); setExpanded(false); }}
              style={[s.ghostBtn, {borderColor: colors.border}]}
            >
              <Text style={[s.ghostTxt, {color: colors.textSecondary}]}>Dismiss</Text>
            </PressableScale>
            {top.action && (
              <PressableScale
                onPress={() => { onNavigate?.(top); setExpanded(false); }}
                style={[s.primaryBtn, {backgroundColor: colors.primary}]}
              >
                <Text style={[s.primaryTxt, {color: colors.textOnPrimary}]}>{top.action.label}</Text>
              </PressableScale>
            )}
          </View>
        </View>
      )}

      <CopilotPanel
        visible={panelOpen}
        onClose={() => setPanelOpen(false)}
        insights={insights}
        onAct={i => onNavigate?.(i)}
        onDismiss={dismiss}
      />

      <View style={s.creatureRow}>
        {!expanded && top && (
          <PressableScale
            onPress={() => setExpanded(true)}
            style={[s.badge, {backgroundColor: colors.surface, borderColor: colors.border}]}
          >
            <Icon name="alert" size={11} color={sev === 'critical' ? '#E5484D' : colors.textSecondary} />
          </PressableScale>
        )}
        {/*
          * Always tappable now, insight or not.
          *
          * It used to be disabled with nothing to report, which made the
          * creature dead weight most of the day — and everything behind the
          * tap (health check, shift summary, find a car, report a problem)
          * is exactly as useful on a quiet shift as a busy one. A single
          * tap opens the panel; the one-line bubble is now reserved for the
          * badge, so nothing is buried behind a long-press.
          */}
        <PressableScale onPress={() => setPanelOpen(true)}>
          <Creature
            mood={mood}
            severity={sev}
            size={SIZE}
            restColor={colors.cardAlt}
            eyeColor={colors.textPrimary}
          />
        </PressableScale>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  root: {position: 'absolute', alignItems: 'flex-end', zIndex: 40},
  creatureRow: {flexDirection: 'row', alignItems: 'flex-end', gap: 6},
  badge: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  bubble: {
    maxWidth: 260, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: {width: 0, height: 4}, elevation: 4,
  },
  msg: {fontSize: 13, fontWeight: '600', lineHeight: 18},
  bubbleRow: {flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12},
  ghostBtn: {borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7},
  ghostTxt: {fontSize: 12, fontWeight: '700'},
  primaryBtn: {borderRadius: 9, paddingHorizontal: 14, paddingVertical: 7},
  primaryTxt: {fontSize: 12, fontWeight: '800'},
});
