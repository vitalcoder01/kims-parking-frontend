import React, {useState} from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT} from '../../theme/colors';
import {Icon, IconName} from '../../components/Icon';
import {usersApi} from '../../services/api';

// One-time screen shown immediately after self-registration. Never touches
// username or password — only sets the doctor/staff label, which the user
// can also change later via the admin (see userService.updateOwnDesignation).
export function DesignationScreen() {
  const {updateProfile, clearNeedsDesignation} = useAuth();
  const {colors} = useTheme();
  const [saving, setSaving] = useState<'doctor' | 'staff' | null>(null);

  const choose = async (role: 'doctor' | 'staff') => {
    if (saving) return;
    setSaving(role);
    try {
      const user = await usersApi.updateMyDesignation(role);
      updateProfile(user);
      clearNeedsDesignation();
    } catch {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <LinearGradient colors={BRAND_GRADIENT} style={s.hero} start={{x: 0, y: 0}} end={{x: 1, y: 1}}>
        <View style={s.logoRing}>
          <Icon name="userCard" size={40} color="#fff" />
        </View>
        <Text style={s.heroTitle}>One Last Step</Text>
        <Text style={s.heroSub}>How should we set up your account?</Text>
      </LinearGradient>

      <View style={s.body}>
        <Option
          icon="userCard"
          label="Doctor"
          sub="For consulting/visiting doctors"
          active={saving === 'doctor'}
          disabled={!!saving}
          colors={colors}
          onPress={() => choose('doctor')}
        />
        <Option
          icon="staff"
          label="Staff"
          sub="For hospital staff members"
          active={saving === 'staff'}
          disabled={!!saving}
          colors={colors}
          onPress={() => choose('staff')}
        />
        <Text style={[s.footnote, {color: colors.textMuted}]}>You can always ask an admin to change this later.</Text>
      </View>
    </SafeAreaView>
  );
}

function Option({icon, label, sub, active, disabled, colors, onPress}: {
  icon: IconName; label: string; sub: string; active: boolean; disabled: boolean; colors: any; onPress: () => void;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[s.option, {backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled && !active ? 0.5 : 1}]}
    >
      <View style={[s.optionIcon, {backgroundColor: colors.primary + '18'}]}>
        {active ? <ActivityIndicator color={colors.primary} /> : <Icon name={icon} size={26} color={colors.primary} />}
      </View>
      <View style={{flex: 1}}>
        <Text style={[s.optionLabel, {color: colors.textPrimary}]}>{label}</Text>
        <Text style={[s.optionSub, {color: colors.textMuted}]}>{sub}</Text>
      </View>
      <Icon name="arrowRight" size={18} color={colors.textMuted} />
    </PressableScale>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  hero: {paddingTop: 56, paddingBottom: 48, paddingHorizontal: 24, alignItems: 'center'},
  logoRing: {width: 76, height: 76, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)'},
  heroTitle: {color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: -0.5},
  heroSub: {color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 6, fontWeight: '500'},

  body: {padding: 20, marginTop: -20, gap: 14},
  option: {flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, padding: 18, shadowColor: '#000', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.08, shadowRadius: 16, elevation: 6},
  optionIcon: {width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  optionLabel: {fontSize: 17, fontWeight: '800'},
  optionSub: {fontSize: 12, marginTop: 2},
  footnote: {textAlign: 'center', fontSize: 12, marginTop: 8},
});
