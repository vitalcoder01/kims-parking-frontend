import React, {useEffect, useRef, useState} from 'react';
import {Animated, Text, StyleSheet, Vibration, View, PanResponder, Dimensions} from 'react-native';
import {useAppState} from '../context/AppStateContext';
import {useAuth} from '../context/AuthContext';
import {useTheme} from '../context/ThemeContext';
import {Icon} from './Icon';

const {width: SCREEN_W} = Dimensions.get('window');
// How far (or how fast) a drag has to go before it counts as "let go of
// this" rather than "just nudged it" — sideways off either edge, or a flick
// upward back toward the status bar it dropped in from.
const H_DISMISS_DIST = 90;
const V_DISMISS_DIST = -60;
const FLING_VELOCITY = 0.5;

export function NotificationBanner() {
  const {notifications, markNotificationRead} = useAppState();
  const {user} = useAuth();
  const {colors} = useTheme();
  // Entrance/exit slide — separate from `pan` below so a half-finished swipe
  // never has to fight the drop-in/auto-hide animation driving the same axis.
  const slide = useRef(new Animated.Value(-160)).current;
  // The swipe gesture's own live offset, reset to {0,0} once the card either
  // snaps back or is actually dismissed.
  const pan = useRef(new Animated.ValueXY({x: 0, y: 0})).current;
  const [current, setCurrent] = useState<typeof notifications[0] | null>(null);
  const autoHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unread = notifications.filter(n =>
    !n.read &&
    (n.targetId === user?.id ||
     (user?.linkedDriverId != null && n.targetId === user.linkedDriverId) ||
     n.targetRole === user?.role ||
     n.targetRole === 'all')
  );

  const clearAutoHide = () => {
    if (autoHideTimer.current) { clearTimeout(autoHideTimer.current); autoHideTimer.current = null; }
  };

  const finalizeDismiss = (id: string | number) => {
    markNotificationRead(id);
    setCurrent(null);
    slide.setValue(-160);
    pan.setValue({x: 0, y: 0});
  };

  const scheduleAutoHide = (n: typeof notifications[0], delay: number) => {
    clearAutoHide();
    autoHideTimer.current = setTimeout(() => {
      Animated.timing(slide, {toValue: -160, duration: 250, useNativeDriver: true})
        .start(() => finalizeDismiss(n.id));
    }, delay);
  };

  // A banner already captured into `current` keeps playing its scheduled
  // animation even after logout clears the `notifications` array — that
  // array being empty doesn't un-show something already showing. Force it
  // closed the moment there's no logged-in user to show it for.
  useEffect(() => {
    if (!user) { clearAutoHide(); slide.setValue(-160); pan.setValue({x: 0, y: 0}); setCurrent(null); }
  }, [user, slide, pan]);

  useEffect(() => {
    if (!user) return;
    if (unread.length > 0 && !current) {
      const next = unread[0];
      setCurrent(next);
      if (next.type === 'alarm') {
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      } else {
        Vibration.vibrate(300);
      }
      Animated.spring(slide, {toValue: 0, useNativeDriver: true, speed: 14}).start();
      scheduleAutoHide(next, next.type === 'alarm' ? 8000 : 4000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread.length]);

  // Swipe sideways off either edge, or flick it back up toward the status
  // bar — either dismisses it outright. Anything short of that (a nudge that
  // doesn't clear the distance/velocity bar) springs right back, and the
  // auto-hide clock — paused for the duration of the touch — picks back up
  // from a fresh full delay rather than wherever it left off, since a card
  // someone just touched is a card someone was just reading.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dx) > 6 || g.dy < -6,
      onPanResponderGrant: clearAutoHide,
      onPanResponderMove: Animated.event([null, {dx: pan.x, dy: pan.y}], {useNativeDriver: false}),
      onPanResponderRelease: (_evt, g) => {
        if (!current) return;
        const flungSideways = Math.abs(g.dx) > H_DISMISS_DIST || Math.abs(g.vx) > FLING_VELOCITY;
        const flungUp = g.dy < V_DISMISS_DIST || g.vy < -FLING_VELOCITY;
        if (flungSideways || flungUp) {
          const toX = flungUp ? 0 : g.dx > 0 ? SCREEN_W : -SCREEN_W;
          const toY = flungUp ? -300 : 0;
          Animated.timing(pan, {toValue: {x: toX, y: toY}, duration: 220, useNativeDriver: true})
            .start(() => finalizeDismiss(current.id));
        } else {
          Animated.spring(pan, {toValue: {x: 0, y: 0}, useNativeDriver: true, friction: 7}).start();
          scheduleAutoHide(current, current.type === 'alarm' ? 8000 : 4000);
        }
      },
    }),
  ).current;

  if (!current) return null;

  const bgColor = current.type === 'alarm' ? colors.error : current.type === 'warning' ? colors.warning : colors.primary;
  const opacity = Animated.multiply(
    pan.x.interpolate({inputRange: [-SCREEN_W, 0, SCREEN_W], outputRange: [0.15, 1, 0.15], extrapolate: 'clamp'}),
    pan.y.interpolate({inputRange: [-160, 0, 40], outputRange: [0.15, 1, 1], extrapolate: 'clamp'}),
  );

  return (
    // box-none: only the floating card below is touchable — the margin
    // around it (and the status-bar area above) lets taps through to
    // whatever's actually on screen underneath.
    <View style={s.wrap} pointerEvents="box-none">
      <Animated.View
        style={[
          s.card,
          {
            backgroundColor: bgColor,
            opacity,
            transform: [
              {translateY: Animated.add(slide, pan.y)},
              {translateX: pan.x},
            ],
          },
        ]}
        {...panResponder.panHandlers}>
        <Icon name={current.type === 'alarm' ? 'bellAlert' : current.type === 'warning' ? 'alert' : 'info'} size={22} color="#fff" />
        <View style={s.text}>
          <Text style={s.title} numberOfLines={1}>{current.title}</Text>
          <Text style={s.body} numberOfLines={2}>{current.body}</Text>
        </View>
        {/* No close button — swipe sideways or flick up to dismiss. */}
        <View style={s.grabHint} />
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, paddingTop: 48, paddingHorizontal: 12, alignItems: 'stretch'},
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.28, shadowRadius: 12, elevation: 12,
  },
  text: {flex: 1},
  title: {color: '#fff', fontWeight: '800', fontSize: 14},
  body: {color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2},
  // A short pill instead of an affordance icon — the same visual shorthand
  // as a bottom-sheet's drag handle, oriented for a card you swipe away
  // rather than pull down.
  grabHint: {width: 4, height: 28, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.35)'},
});
