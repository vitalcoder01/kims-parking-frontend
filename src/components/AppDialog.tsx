import React, {createContext, useCallback, useContext, useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, Modal, Pressable, Animated, Easing} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {Icon, IconName} from './Icon';
import {PressableScale} from './PressableScale';

// In-app replacement for React Native's Alert.alert.
//
// The native dialog is an OS surface: it ignores the app's theme entirely
// (stark white card in dark mode), can't carry an icon or any severity
// colour, and its title slot only fits a bare word like "Error" — which
// tells a valet nothing and looks like a crash rather than a rule the system
// is enforcing on purpose. This renders inside the app instead, so a
// "that car's already parked" message reads as guidance in the product's own
// voice.

export type DialogTone = 'error' | 'warning' | 'success' | 'info';

interface DialogButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface DialogOptions {
  title?: string;
  message: string;
  tone?: DialogTone;
  buttons?: DialogButton[];
}

interface DialogApi {
  /** Drop-in for Alert.alert — one dismiss button. */
  alert: (message: string, opts?: {title?: string; tone?: DialogTone}) => void;
  /** Resolves true if the confirming button was tapped. */
  confirm: (opts: {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    tone?: DialogTone;
    destructive?: boolean;
  }) => Promise<boolean>;
  show: (opts: DialogOptions) => void;
}

const Ctx = createContext<DialogApi>({
  alert: () => {},
  confirm: async () => false,
  show: () => {},
});

export function useDialog() { return useContext(Ctx); }

const TONE_ICON: Record<DialogTone, IconName> = {
  error: 'alert',
  warning: 'bellAlert',
  success: 'check',
  info: 'info',
};

export function DialogProvider({children}: {children: React.ReactNode}) {
  const [opts, setOpts] = useState<DialogOptions | null>(null);
  const [visible, setVisible] = useState(false);
  const scale = useRef(new Animated.Value(0.92)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const {colors, isDark} = useTheme();

  // Queue, so a second alert fired while one is open isn't swallowed.
  const queue = useRef<DialogOptions[]>([]);

  const present = useCallback((next: DialogOptions) => {
    setOpts(cur => {
      if (cur) {
        // Never queue a dialog that repeats what's already on screen, or one
        // that's already waiting. Repeated alerts about the same thing (a job
        // nobody has actioned, say) would otherwise pile up and have to be
        // dismissed one by one — each tap revealing another copy of the
        // message the user just declined to act on.
        const same = (a: DialogOptions, b: DialogOptions) =>
          a.title === b.title && a.message === b.message;
        if (same(cur, next) || queue.current.some(q => same(q, next))) return cur;
        queue.current.push(next);
        return cur;
      }
      return next;
    });
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
  }, []);

  // Run the exit animation to completion before swapping content, otherwise
  // a queued dialog pops in mid-fade with the previous one's text.
  useEffect(() => {
    if (visible && opts) {
      scale.setValue(0.92);
      opacity.setValue(0);
      const raf = requestAnimationFrame(() => {
        Animated.parallel([
          Animated.timing(opacity, {toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true}),
          Animated.spring(scale, {toValue: 1, useNativeDriver: true, speed: 18, bounciness: 5}),
        ]).start();
      });
      return () => cancelAnimationFrame(raf);
    }
    if (!visible && opts) {
      Animated.parallel([
        Animated.timing(opacity, {toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true}),
        Animated.timing(scale, {toValue: 0.95, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true}),
      ]).start(() => {
        const next = queue.current.shift();
        if (next) { setOpts(next); setVisible(true); } else { setOpts(null); }
      });
    }
  }, [visible, opts]);

  const api: DialogApi = {
    show: present,
    alert: useCallback((message, o) => {
      present({message, title: o?.title, tone: o?.tone ?? 'error', buttons: [{text: 'OK'}]});
    }, [present]),
    confirm: useCallback((o) => new Promise<boolean>(resolve => {
      present({
        title: o.title,
        message: o.message,
        tone: o.tone ?? (o.destructive ? 'warning' : 'info'),
        buttons: [
          {text: o.cancelText ?? 'Cancel', style: 'cancel', onPress: () => resolve(false)},
          {
            text: o.confirmText ?? 'Confirm',
            style: o.destructive ? 'destructive' : 'default',
            onPress: () => resolve(true),
          },
        ],
      });
    }), [present]),
  };

  const tone = opts?.tone ?? 'info';
  const toneColor = tone === 'error' ? colors.error
    : tone === 'warning' ? colors.warning
    : tone === 'success' ? colors.success
    : colors.primary;
  const buttons = opts?.buttons?.length ? opts.buttons : [{text: 'OK'}];

  return (
    <Ctx.Provider value={api}>
      {children}
      <Modal visible={!!opts} transparent animationType="none" onRequestClose={dismiss} statusBarTranslucent>
        <Animated.View style={[s.backdrop, {opacity, backgroundColor: isDark ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.45)'}]}>
          {/* Tapping outside only dismisses a single-button (informational)
              dialog — a real choice shouldn't be resolvable by a stray tap. */}
          <Pressable style={s.backdropFill} onPress={buttons.length === 1 ? dismiss : undefined} />
        </Animated.View>

        <View style={s.wrap} pointerEvents="box-none">
          <Animated.View style={[
            s.card,
            {backgroundColor: colors.surface, borderColor: colors.border, opacity, transform: [{scale}]},
          ]}>
            <View style={[s.iconWrap, {backgroundColor: toneColor + '18'}]}>
              <Icon name={TONE_ICON[tone]} size={24} color={toneColor} />
            </View>

            {!!opts?.title && (
              <Text style={[s.title, {color: colors.textPrimary}]}>{opts.title}</Text>
            )}
            <Text style={[s.message, {color: opts?.title ? colors.textSecondary : colors.textPrimary}]}>
              {opts?.message}
            </Text>

            <View style={[s.actions, buttons.length > 2 && s.actionsStacked]}>
              {buttons.map((b, i) => {
                const isCancel = b.style === 'cancel';
                const isDestructive = b.style === 'destructive';
                const bg = isCancel ? colors.cardAlt : isDestructive ? colors.error : colors.primary;
                const fg = isCancel ? colors.textSecondary : colors.textOnPrimary;
                return (
                  <PressableScale
                    key={`${b.text}-${i}`}
                    style={[s.btn, {backgroundColor: bg, borderColor: isCancel ? colors.border : 'transparent'}]}
                    onPress={() => { dismiss(); b.onPress?.(); }}>
                    <Text style={[s.btnTxt, {color: fg}]}>{b.text}</Text>
                  </PressableScale>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

const s = StyleSheet.create({
  backdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  backdropFill: {flex: 1},
  wrap: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28},
  card: {width: '100%', maxWidth: 380, borderRadius: 24, borderWidth: 1, padding: 24, alignItems: 'center'},
  iconWrap: {width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14},
  title: {fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 6},
  message: {fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 21},
  actions: {flexDirection: 'row', gap: 10, marginTop: 22, alignSelf: 'stretch'},
  actionsStacked: {flexDirection: 'column'},
  btn: {flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center', justifyContent: 'center'},
  btnTxt: {fontSize: 14, fontWeight: '800'},
});
