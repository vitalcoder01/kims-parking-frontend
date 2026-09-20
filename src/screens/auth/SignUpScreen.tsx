import React, {useState, useRef} from 'react';
import {View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useNavigation} from '@react-navigation/native';
import {PressableScale} from '../../components/PressableScale';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon} from '../../components/Icon';

// Self-registration for a doctor/staff member. Mirrors the web portal's
// screen: name, 10-digit phone, password. The backend always creates a
// 'doctor' and AuthContext.register raises needsDesignation, so the
// navigator swaps to the designation screen by itself once this succeeds.
export function SignUpScreen() {
  const {register} = useAuth();
  const {colors, isDark} = useTheme();
  const navigation = useNavigation<any>();
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [focused, setFocused]   = useState<'name' | 'phone' | 'password' | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const phoneRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shake, {toValue: 10, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: -10, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: 6, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: -6, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: 0, duration: 60, useNativeDriver: true}),
    ]).start();
  };

  const fail = (msg: string) => { setError(msg); triggerShake(); };

  const handleSignUp = async () => {
    if (loading) return;
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (!name.trim()) return fail('Enter your name');
    if (digits.length !== 10) return fail('Enter a valid 10-digit phone number');
    if (password.length < 8) return fail('Password must be at least 8 characters');
    setLoading(true);
    try {
      await register(name.trim(), digits, password);
    } catch (err: any) {
      fail(err.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const gradient = isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT;
  const fieldFill = isDark ? colors.card : colors.cardAlt;
  const borderFor = (f: 'name' | 'phone' | 'password') =>
    error ? colors.error : focused === f ? colors.primary : 'transparent';

  return (
    <SafeAreaView edges={['left', 'right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <LinearGradient colors={gradient} style={s.hero} start={{x: 0, y: 0}} end={{x: 1, y: 1}}>
            <View style={s.logoTile}>
              <Icon name="parking" size={38} color="#15161A" />
            </View>
            <Text style={s.heroTitle}>KIMS Hospital</Text>
            <Text style={s.heroSub}>Create your account</Text>
          </LinearGradient>

          <Animated.View style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border, transform: [{translateX: shake}]}]}>
            <Text style={[s.cardTitle, {color: colors.textPrimary}]}>Create Your Login</Text>
            <Text style={[s.cardSub, {color: colors.textMuted}]}>Just your name, phone, and a password</Text>

            <View style={s.fields}>
              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>Your name</Text>
                <View style={[s.inputWrap, {backgroundColor: fieldFill, borderColor: borderFor('name')}]}>
                  <TextInput
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="This is exactly what you'll log in as"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={t => { setName(t); setError(''); }}
                    onFocus={() => setFocused('name')}
                    onBlur={() => setFocused(null)}
                    autoCapitalize="words"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => phoneRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>Phone number</Text>
                <View style={[s.inputWrap, {backgroundColor: fieldFill, borderColor: borderFor('phone')}]}>
                  <TextInput
                    ref={phoneRef}
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={colors.textMuted}
                    value={phone}
                    onChangeText={t => { setPhone(t); setError(''); }}
                    onFocus={() => setFocused('phone')}
                    onBlur={() => setFocused(null)}
                    keyboardType="number-pad"
                    maxLength={10}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>Password</Text>
                <View style={[s.inputWrap, {backgroundColor: fieldFill, borderColor: borderFor('password')}]}>
                  <TextInput
                    ref={passwordRef}
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={t => { setPassword(t); setError(''); }}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleSignUp}
                  />
                  <PressableScale onPress={() => setShowPass(p => !p)} style={s.eyeBtn} hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}>
                    <Icon name={showPass ? 'eyeOff' : 'eye'} size={19} color={colors.textMuted} />
                  </PressableScale>
                </View>
              </View>
            </View>

            {!!error && (
              <View style={[s.errorBanner, {backgroundColor: colors.errorLight}]}>
                <Icon name="alert" size={15} color={colors.error} />
                <Text style={[s.errorTxt, {color: colors.error}]}>{error}</Text>
              </View>
            )}

            <PressableScale
              onPress={handleSignUp}
              disabled={loading}
              style={[s.cta, {backgroundColor: colors.primary, opacity: loading ? 0.65 : 1}]}>
              {loading
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <>
                    <Text style={[s.ctaTxt, {color: colors.textOnPrimary}]}>Create Account</Text>
                    <Icon name="arrowRight" size={19} color={colors.textOnPrimary} />
                  </>}
            </PressableScale>

            <PressableScale onPress={() => navigation.goBack()} style={s.altRow}>
              <Text style={[s.altTxt, {color: colors.textMuted}]}>
                Already have an account? <Text style={{color: colors.primary, fontWeight: '800'}}>Sign In</Text>
              </Text>
            </PressableScale>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {flexGrow: 1, paddingBottom: 32},

  hero: {paddingTop: 72, paddingBottom: 52, paddingHorizontal: 24, alignItems: 'center'},
  logoTile: {
    width: 76, height: 76, borderRadius: 22, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 22,
  },
  heroTitle: {color: '#fff', fontSize: 30, fontWeight: '900', letterSpacing: -0.8},
  heroSub: {color: 'rgba(255,255,255,0.62)', fontSize: 13.5, marginTop: 7, fontWeight: '500'},

  card: {margin: 16, marginTop: -28, borderRadius: 28, borderWidth: 1, padding: 24, paddingTop: 28},
  cardTitle: {fontSize: 27, fontWeight: '900', letterSpacing: -0.6},
  cardSub: {fontSize: 14, marginTop: 5, marginBottom: 26},

  fields: {gap: 18},
  field: {gap: 9},
  label: {fontSize: 13, fontWeight: '700'},
  inputWrap: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, height: 56, gap: 10},
  input: {flex: 1, fontSize: 15.5, fontWeight: '600', padding: 0},
  eyeBtn: {padding: 2},

  errorBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, borderRadius: 14, padding: 13},
  errorTxt: {flex: 1, fontSize: 13, fontWeight: '600'},

  cta: {borderRadius: 999, height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 26},
  ctaTxt: {fontSize: 16, fontWeight: '800'},

  altRow: {alignItems: 'center', marginTop: 20, paddingVertical: 4},
  altTxt: {fontSize: 13, fontWeight: '600'},
});
