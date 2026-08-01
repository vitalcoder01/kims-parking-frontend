import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, Linking, ActivityIndicator} from 'react-native';
import {PressableScale} from './PressableScale';
import {useTheme} from '../context/ThemeContext';
import {appApi} from '../services/api';
import {Icon} from './Icon';
import {APP_VERSION_CODE, APP_VERSION_NAME} from '../config/version';

type UpdateInfo = {latestVersionCode: number; latestVersionName: string; apkUrl: string; notes?: string};
type GateState = {status: 'checking'} | {status: 'ok'} | {status: 'blocked'; info: UpdateInfo};

// Replaces the app's entire content — not an overlay on top of it — until
// the version check has actually resolved. A Modal rendered as a SIBLING of
// the login screen (the previous approach) left a real window where the
// login screen was mounted and interactive while the check was still
// in-flight; a stale build could complete a login before the modal ever
// appeared. Nothing here (including the login screen) mounts until this
// gate has confirmed the installed build is current.
export function UpdateGate({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  const [state, setState] = useState<GateState>({status: 'checking'});

  useEffect(() => {
    let cancelled = false;
    appApi.checkVersion()
      .then(data => {
        if (cancelled) return;
        setState(data.latestVersionCode > APP_VERSION_CODE ? {status: 'blocked', info: data} : {status: 'ok'});
      })
      .catch(() => {
        // No connectivity yet / backend briefly down — fail OPEN rather than
        // bricking the app on a network hiccup. The check re-runs every
        // launch, so a real update still reaches everyone quickly once
        // connectivity is back.
        if (!cancelled) setState({status: 'ok'});
      });
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'checking') {
    return (
      <View style={[s.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (state.status === 'ok') return <>{children}</>;

  const {info} = state;
  return (
    <View style={[s.center, {backgroundColor: colors.background}]}>
      <View style={[s.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
        <View style={[s.iconWrap, {backgroundColor: colors.primaryLight}]}>
          <Icon name="rocket" size={26} color={colors.primary} />
        </View>
        <Text style={[s.title, {color: colors.textPrimary}]}>Update Required</Text>
        <Text style={[s.sub, {color: colors.textSecondary}]}>
          Version {info.latestVersionName} is required to continue — you're on {APP_VERSION_NAME}.
        </Text>
        {info.notes ? (
          <Text style={[s.notes, {color: colors.textMuted, backgroundColor: colors.cardAlt}]}>{info.notes}</Text>
        ) : null}
        <PressableScale
          style={[s.cta, {backgroundColor: colors.primary, shadowColor: colors.primary}]}
          onPress={() => Linking.openURL(info.apkUrl)}>
          <Text style={s.ctaTxt}>Download & Install</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  card: {width: '100%', maxWidth: 360, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center'},
  iconWrap: {width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 10},
  title: {fontSize: 19, fontWeight: '900'},
  sub: {fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19},
  notes: {fontSize: 12, borderRadius: 12, padding: 12, marginTop: 14, lineHeight: 17, alignSelf: 'stretch'},
  cta: {
    marginTop: 20, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', alignItems: 'center',
    shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  ctaTxt: {color: '#fff', fontSize: 14, fontWeight: '900'},
});
