import React, {useEffect, useRef, useState} from 'react';
import {Animated, Text, StyleSheet, TouchableOpacity, Vibration, View} from 'react-native';
import {useAppState} from '../context/AppStateContext';
import {useAuth} from '../context/AuthContext';
import {useTheme} from '../context/ThemeContext';

export function NotificationBanner() {
  const {notifications, markNotificationRead} = useAppState();
  const {user} = useAuth();
  const {colors} = useTheme();
  const anim = useRef(new Animated.Value(-120)).current;
  const [current, setCurrent] = useState<typeof notifications[0] | null>(null);

  const unread = notifications.filter(n =>
    !n.read &&
    (n.targetId === user?.id ||
     (user?.linkedDriverId != null && n.targetId === user.linkedDriverId) ||
     n.targetRole === user?.role ||
     n.targetRole === 'all')
  );

  useEffect(() => {
    if (unread.length > 0 && !current) {
      const next = unread[0];
      setCurrent(next);
      if (next.type === 'alarm') {
        Vibration.vibrate([0, 500, 200, 500, 200, 500]);
      } else {
        Vibration.vibrate(300);
      }
      Animated.sequence([
        Animated.spring(anim, {toValue: 0, useNativeDriver: true, speed: 14}),
        Animated.delay(next.type === 'alarm' ? 8000 : 4000),
        Animated.timing(anim, {toValue: -120, duration: 300, useNativeDriver: true}),
      ]).start(() => {
        markNotificationRead(next.id);
        setCurrent(null);
      });
    }
  }, [unread.length]);

  if (!current) return null;

  const bgColor = current.type === 'alarm' ? colors.error : current.type === 'warning' ? colors.warning : colors.primary;

  return (
    <Animated.View style={[s.banner, {backgroundColor: bgColor, transform: [{translateY: anim}]}]}>
      <View style={s.row}>
        <Text style={s.icon}>
          {current.type === 'alarm' ? '🔔' : current.type === 'warning' ? '⚠️' : 'ℹ️'}
        </Text>
        <View style={s.text}>
          <Text style={s.title}>{current.title}</Text>
          <Text style={s.body}>{current.body}</Text>
        </View>
        <TouchableOpacity onPress={() => {
          markNotificationRead(current.id);
          Animated.timing(anim, {toValue: -120, duration: 200, useNativeDriver: true}).start(() => setCurrent(null));
        }}>
          <Text style={s.close}>✕</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999, paddingTop: 48, paddingBottom: 16, paddingHorizontal: 16, shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.3, shadowRadius: 8, elevation: 20},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12},
  icon: {fontSize: 24},
  text: {flex: 1},
  title: {color: '#fff', fontWeight: '800', fontSize: 14},
  body: {color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2},
  close: {color: '#fff', fontSize: 18, fontWeight: '700', padding: 4},
});
