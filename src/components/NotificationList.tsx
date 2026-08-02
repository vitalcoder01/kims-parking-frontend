import React, {useRef, useEffect} from 'react';
import {Animated, PanResponder, StyleSheet, Text, View, Dimensions, ScrollView, LayoutAnimation, Platform, UIManager} from 'react-native';
import {PressableScale} from './PressableScale';
import {Icon, IconName} from './Icon';
import {useAppState, Notification} from '../context/AppStateContext';
import {useAuth} from '../context/AuthContext';
import {useTheme} from '../context/ThemeContext';

// Enable smooth insert/remove transitions on Android — iOS has this on by
// default. Done at module load so a first-notification transition doesn't
// pop straight in with no animation while React races to enable it.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const {width: SCREEN_W} = Dimensions.get('window');
// Swipe far enough (either direction) OR flick fast enough for the card to
// dismiss on release; anything below springs back — matches the OS
// notification-tray gesture people already know.
const H_DISMISS_DIST = 90;
const FLING_VELOCITY = 0.5;

// Same relevance filter the old floating banner used — a notification is
// this user's iff it names them, names their driver id, or blanket-targets
// their role (or 'all').
export function relevantNotifications(notifications: Notification[], user: {id?: number; role?: string; linkedDriverId?: number | null} | null): Notification[] {
  if (!user) return [];
  return notifications.filter(n =>
    n.targetId === user.id
    || (user.linkedDriverId != null && n.targetId === user.linkedDriverId)
    || n.targetRole === user.role
    || n.targetRole === 'all'
  );
}

export function unreadNotificationCount(notifications: Notification[], user: {id?: number; role?: string; linkedDriverId?: number | null} | null): number {
  return relevantNotifications(notifications, user).filter(n => !n.read).length;
}

type ItemProps = {
  n: Notification;
  onDismiss: (id: number) => void;
  onTap?: (n: Notification) => void;
};

// One swipeable row. Owns its own gesture + slide animation so a swipe in
// progress on one card can't cancel the auto-hide or re-render of any other.
function NotificationRow({n, onDismiss, onTap}: ItemProps) {
  const {colors} = useTheme();
  const pan = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(1)).current; // 0..1 collapse factor for the exit animation

  const animateOut = (dir: 1 | -1) => {
    Animated.parallel([
      Animated.timing(pan, {toValue: dir * SCREEN_W, duration: 180, useNativeDriver: true}),
      Animated.timing(height, {toValue: 0, duration: 180, delay: 60, useNativeDriver: false}),
    ]).start(() => onDismiss(n.id));
  };

  const responder = useRef(
    PanResponder.create({
      // Vertical drags belong to the parent ScrollView; only claim horizontal
      // ones. Threshold small enough to feel responsive, large enough that a
      // scroll flick isn't hijacked as a swipe.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: Animated.event([null, {dx: pan}], {useNativeDriver: false}),
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: (_e, g) => {
        const shouldDismiss = Math.abs(g.dx) > H_DISMISS_DIST || Math.abs(g.vx) > FLING_VELOCITY;
        if (shouldDismiss) {
          animateOut(g.dx > 0 ? 1 : -1);
        } else {
          Animated.spring(pan, {toValue: 0, useNativeDriver: true, friction: 7}).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {toValue: 0, useNativeDriver: true, friction: 7}).start();
      },
    }),
  ).current;

  const tone: {icon: IconName; accent: string} = n.type === 'alarm'
    ? {icon: 'bellAlert', accent: colors.error}
    : n.type === 'warning'
    ? {icon: 'alert', accent: colors.warning}
    : {icon: 'info', accent: colors.primary};

  const opacity = pan.interpolate({
    inputRange: [-SCREEN_W, -60, 0, 60, SCREEN_W],
    outputRange: [0, 1, 1, 1, 0],
  });
  const maxH = height.interpolate({inputRange: [0, 1], outputRange: [0, 140]});

  return (
    <Animated.View style={{maxHeight: maxH, overflow: 'hidden', marginBottom: 10}}>
      <Animated.View
        style={[s.row, {backgroundColor: colors.surface, borderColor: colors.border, transform: [{translateX: pan}], opacity}]}
        {...responder.panHandlers}>
        <PressableScale
          style={s.rowInner}
          onPress={() => onTap?.(n)}>
          <View style={[s.iconWrap, {backgroundColor: tone.accent + '18'}]}>
            <Icon name={tone.icon} size={18} color={tone.accent} />
          </View>
          <View style={{flex: 1}}>
            <View style={s.headRow}>
              <Text style={[s.title, {color: colors.textPrimary}]} numberOfLines={1}>{n.title}</Text>
              {!n.read && <View style={[s.dot, {backgroundColor: tone.accent}]} />}
            </View>
            <Text style={[s.body, {color: colors.textSecondary}]} numberOfLines={2}>{n.body}</Text>
            <Text style={[s.time, {color: colors.textMuted}]}>{formatAgo(n.createdAt)}</Text>
          </View>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}

function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(ms).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
}

type Props = {
  // Optional overrides — default behaviour reads notifications straight from
  // AppStateContext and filters them for the logged-in user, which is what
  // every embed currently wants.
  notifications?: Notification[];
  emptyLabel?: string;
  onTap?: (n: Notification) => void;
  maxVisible?: number;
};

export function NotificationList({notifications, emptyLabel = 'No notifications yet.', onTap, maxVisible = 30}: Props) {
  const {notifications: allNotifs, markNotificationRead} = useAppState();
  const {user} = useAuth();
  const {colors} = useTheme();
  const source = notifications ?? relevantNotifications(allNotifs, user ?? null);
  // Newest first, capped so a very long history can't blow up rendering —
  // scrolling handles the visible ones, older ones drop off the tail.
  const shown = [...source]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, maxVisible);

  const handleDismiss = (id: number) => {
    // Smooth reflow for the neighbours as this row collapses out. Configured
    // once per dismiss so a rapid double-swipe doesn't queue up conflicting
    // animations.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    markNotificationRead(id).catch(() => {});
  };

  const handleTap = (n: Notification) => {
    if (!n.read) markNotificationRead(n.id).catch(() => {});
    onTap?.(n);
  };

  if (shown.length === 0) {
    return (
      <View style={[s.emptyWrap, {borderColor: colors.border}]}>
        <Icon name="inbox" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
        <Text style={[s.emptyTxt, {color: colors.textMuted}]}>{emptyLabel}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{padding: 4}} showsVerticalScrollIndicator={false}>
      {shown.map(n => (
        <NotificationRow key={n.id} n={n} onDismiss={handleDismiss} onTap={handleTap} />
      ))}
    </ScrollView>
  );
}

// Overlay bell + sheet — used by roles (doctor/driver) that don't have a
// dedicated inbox screen. The sheet is a modal, not a floating overlay, so
// it never covers page content unless the user explicitly opens it.
export function NotificationSheet({visible, onClose, onTap}: {visible: boolean; onClose: () => void; onTap?: (n: Notification) => void}) {
  const {colors, isDark} = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true}).start();
  }, [visible, anim]);

  if (!visible) return null;
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        s.sheetBackdrop,
        {opacity: anim, backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.45)'},
      ]}>
      <PressableScale style={s.sheetTapCatcher} onPress={onClose} />
      <Animated.View
        style={[
          s.sheet,
          {
            backgroundColor: colors.background,
            transform: [{translateY: anim.interpolate({inputRange: [0, 1], outputRange: [40, 0]})}],
          },
        ]}>
        <View style={s.sheetHandle} />
        <View style={s.sheetHeader}>
          <Text style={[s.sheetTitle, {color: colors.textPrimary}]}>Notifications</Text>
          <PressableScale onPress={onClose} style={[s.closeBtn, {backgroundColor: colors.cardAlt}]}>
            <Icon name="close" size={16} color={colors.textPrimary} />
          </PressableScale>
        </View>
        <View style={{flex: 1, paddingHorizontal: 16, paddingBottom: 24}}>
          <NotificationList onTap={onTap} />
        </View>
      </Animated.View>
    </Animated.View>
  );
}

// Small bell button + red count badge — drop it into any header.
export function NotificationBellButton({count, onPress, iconColor = '#fff', badgeBorder = '#fff'}: {count: number; onPress: () => void; iconColor?: string; badgeBorder?: string}) {
  return (
    <PressableScale style={s.bellBtn} onPress={onPress}>
      <Icon name="bell" size={20} color={iconColor} />
      {count > 0 && (
        <View style={[s.bellBadge, {borderColor: badgeBorder}]}>
          <Text style={s.bellBadgeTxt}>{count > 9 ? '9+' : count}</Text>
        </View>
      )}
    </PressableScale>
  );
}

const s = StyleSheet.create({
  row: {
    borderRadius: 16, borderWidth: 1,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  rowInner: {flexDirection: 'row', gap: 12, padding: 14, alignItems: 'flex-start'},
  iconWrap: {width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  headRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  title: {flex: 1, fontSize: 14, fontWeight: '800'},
  dot: {width: 8, height: 8, borderRadius: 4},
  body: {fontSize: 12.5, marginTop: 3, lineHeight: 17},
  time: {fontSize: 11, marginTop: 6, fontWeight: '600'},

  emptyWrap: {alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 40, paddingHorizontal: 20, marginTop: 8},
  emptyTxt: {fontSize: 12.5, fontWeight: '600'},

  sheetBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, justifyContent: 'flex-end'},
  sheetTapCatcher: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  sheet: {height: '80%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8},
  sheetHandle: {alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.5)', marginBottom: 6},
  sheetHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14},
  sheetTitle: {fontSize: 18, fontWeight: '900'},
  closeBtn: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},

  bellBtn: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)'},
  bellBadge: {position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5},
  bellBadgeTxt: {color: '#fff', fontSize: 10, fontWeight: '800'},
});
