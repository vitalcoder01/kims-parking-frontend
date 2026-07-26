import React, {useEffect, useState} from 'react';
import {Modal, View, Text, StyleSheet, TouchableOpacity, Linking} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {appApi} from '../services/api';
import {APP_VERSION_CODE, APP_VERSION_NAME} from '../config/version';

export function UpdateModal() {
  const {colors} = useTheme();
  const [info, setInfo] = useState<{latestVersionCode: number; latestVersionName: string; apkUrl: string; notes?: string} | null>(null);

  useEffect(() => {
    appApi.checkVersion()
      .then(data => {
        if (data.latestVersionCode > APP_VERSION_CODE) setInfo(data);
      })
      .catch(() => {
        // No connectivity yet / backend briefly down — not worth surfacing
        // an error for a background update check, it'll just retry next launch.
      });
  }, []);

  if (!info) return null;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={s.overlay}>
        <View style={[s.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
          <Text style={s.icon}>🚀</Text>
          <Text style={[s.title, {color: colors.textPrimary}]}>Update Available</Text>
          <Text style={[s.sub, {color: colors.textSecondary}]}>
            Version {info.latestVersionName} is ready — you're on {APP_VERSION_NAME}.
          </Text>
          {info.notes ? (
            <Text style={[s.notes, {color: colors.textMuted, backgroundColor: colors.cardAlt}]}>{info.notes}</Text>
          ) : null}
          <TouchableOpacity
            activeOpacity={0.85}
            style={[s.cta, {backgroundColor: colors.primary, shadowColor: colors.primary}]}
            onPress={() => Linking.openURL(info.apkUrl)}>
            <Text style={s.ctaTxt}>Download & Install</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7} style={s.later} onPress={() => setInfo(null)}>
            <Text style={[s.laterTxt, {color: colors.textMuted}]}>Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24},
  card: {width: '100%', maxWidth: 360, borderRadius: 22, borderWidth: 1, padding: 24, alignItems: 'center'},
  icon: {fontSize: 36, marginBottom: 8},
  title: {fontSize: 19, fontWeight: '900'},
  sub: {fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19},
  notes: {fontSize: 12, borderRadius: 12, padding: 12, marginTop: 14, lineHeight: 17, alignSelf: 'stretch'},
  cta: {
    marginTop: 20, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', alignItems: 'center',
    shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6,
  },
  ctaTxt: {color: '#fff', fontSize: 14, fontWeight: '900'},
  later: {marginTop: 12, padding: 6},
  laterTxt: {fontSize: 13, fontWeight: '700'},
});
