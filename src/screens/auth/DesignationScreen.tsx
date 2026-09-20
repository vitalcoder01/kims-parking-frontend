import React, {useState} from 'react';
import {View, Text, StyleSheet, ActivityIndicator} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {PressableScale} from '../../components/PressableScale';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon, IconName} from '../../components/Icon';
import {usersApi} from '../../services/api';

// One-time screen shown right after self-registration. Never touches the
// username or password — it only sets the doctor/staff label, which an admin
// can also change later (backend userService.updateOwnDesignation).
export function DesignationScreen() {
  const {updateProfile, clearNeedsDesignation} = useAuth();
  const {colors, isDark} = useTheme();
  const [saving, setSaving] = useState<'doctor' | 'staff' | null>(null);
  const [error, setError] = useState('');

  const choose = async (role: 'doctor' | 'staff') => {
    if (saving) return;
    setSaving(role);
    setError('');
    try {
      const user = await usersApi.updateMyDesignation(role);
      updateProfile(user);
      clearNeedsDesignation();
    } catch (err: any) {
      setSaving(null);
      setError(err.message || 'Could not save your choice. Try again.');
    }
  };

  const gradient = isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT;

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={[s.safe, {backgroundColor: colors.background}]}>
      <LinearGradient colors={gradient} style={s.hero} start={{x: 0, y: 0}} end={{x: 1, y: 1}}>
        <View style={s.logoTile}>
          <Icon name="userCard" size={36} color="#15161A" />
        </View>
        <Text style={s.heroTitle}>One Last Step</Text>
        <Text style={s.heroSub}>How should we set up your account?</Text>
      </LinearGradient>

      <View style={s.body}>
        <Option
          icon="userCard" label="Doctor" sub="For consulting/visiting doctors"
          active={saving === 'doctor'} disabled={!!saving} onPress={() => choose('doctor')}
        />
        <Option
          icon="staff" label="Staff" sub="For hospital staff members"
          active={saving === 'staff'} disabled={!!saving} onPress={() => choose('staff')}
        />
        {!!error && (
          <View style={[s.errorBanner, {backgroundColor: colors.errorLight}]}>
            <Icon name="alert" size={15} color={colors.error} />
            <Text style={[s.errorTxt, {color: colors.error}]}>{error}</Text>
          </View>
        )}
        <Text style={[s.note, {color: colors.textMuted}]}>You can always ask an admin to change this later.</Text>
      </View>
    </SafeAreaView>
  );
}

function Option({icon, label, sub, active, disabled, onPress}: {
  icon: IconName; label: string; sub: string; active: boolean; disabled: boolean; onPress: () => void;
}) {
  const {colors} = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      style={[s.option, {backgroundColor: colors.surface, borderColor: colors.border, opacity: disabled && !active ? 0.5 : 1}]}>
      <View style={[s.optionIcon, {backgroundColor: colors.primary + '18'}]}>
        {active
          ? <ActivityIndicator color={colors.primary} />
          : <Icon name={icon} size={26} color={colors.primary} />}
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
  hero: {paddingTop: 72, paddingBottom: 52, paddingHorizontal: 24, alignItems: 'center'},
  logoTile: {
    width: 76, height: 76, borderRadius: 22, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },
  heroTitle: {color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.6},
  heroSub: {color: 'rgba(255,255,255,0.62)', fontSize: 13.5, marginTop: 7, fontWeight: '500'},

  body: {padding: 20, gap: 14},
  option: {flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, padding: 18},
  optionIcon: {width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
  optionLabel: {fontSize: 17, fontWeight: '800'},
  optionSub: {fontSize: 12, marginTop: 2},

  errorBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 13},
  errorTxt: {flex: 1, fontSize: 13, fontWeight: '600'},
  note: {textAlign: 'center', fontSize: 12, marginTop: 8},
});
