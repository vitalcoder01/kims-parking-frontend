import React, {useState, useRef} from 'react';
import {View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated} from 'react-native';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT} from '../../theme/colors';
import {Icon} from '../../components/Icon';

export function SignUpScreen({navigation}: {navigation: any}) {
  const {register} = useAuth();
  const {colors, isDark} = useTheme();
  const [name, setName]         = useState('');
  const [phone, setPhone]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
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

  const handleSignUp = async () => {
    setError('');
    const digits = phone.replace(/\D/g, '');
    if (!name.trim()) {
      setError('Enter your name');
      triggerShake();
      return;
    }
    if (digits.length !== 10) {
      setError('Enter a valid 10-digit phone number');
      triggerShake();
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      await register(name.trim(), digits, password);
      // AppNavigator picks up `needsDesignation` and swaps to the
      // designation screen automatically — nothing to navigate to here.
    } catch (err: any) {
      setError(err.message || 'Could not create account');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <LinearGradient colors={BRAND_GRADIENT} style={s.hero} start={{x: 0, y: 0}} end={{x: 1, y: 1}}>
            <View style={s.logoRing}>
              <Icon name="parking" size={44} color="#fff" />
            </View>
            <Text style={s.heroTitle}>KIMS Hospital</Text>
            <Text style={s.heroSub}>Create your account</Text>
          </LinearGradient>

          <Animated.View style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border, transform: [{translateX: shake}]}]}>
            <Text style={[s.cardTitle, {color: colors.textPrimary}]}>Create Your Login</Text>
            <Text style={[s.cardSub, {color: colors.textMuted}]}>Just your name, phone, and a password</Text>

            <View style={s.fields}>
              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>YOUR NAME</Text>
                <View style={[s.inputWrap, {borderColor: error ? colors.error : colors.border, backgroundColor: isDark ? colors.card : '#F8FAFF'}]}>
                  <Icon name="userCard" size={18} color={colors.textMuted} style={{marginRight: 4}} />
                  <TextInput
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="This is exactly what you'll log in as"
                    placeholderTextColor={colors.textMuted}
                    value={name}
                    onChangeText={t => { setName(t); setError(''); }}
                    autoCapitalize="words"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => phoneRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>PHONE NUMBER</Text>
                <View style={[s.inputWrap, {borderColor: error ? colors.error : colors.border, backgroundColor: isDark ? colors.card : '#F8FAFF'}]}>
                  <Icon name="lock" size={18} color={colors.textMuted} style={{marginRight: 4}} />
                  <TextInput
                    ref={phoneRef}
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={colors.textMuted}
                    value={phone}
                    onChangeText={t => { setPhone(t); setError(''); }}
                    keyboardType="number-pad"
                    maxLength={10}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>PASSWORD</Text>
                <View style={[s.inputWrap, {borderColor: error ? colors.error : colors.border, backgroundColor: isDark ? colors.card : '#F8FAFF'}]}>
                  <Icon name="lock" size={18} color={colors.textMuted} style={{marginRight: 4}} />
                  <TextInput
                    ref={passwordRef}
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="At least 8 characters"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={t => { setPassword(t); setError(''); }}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleSignUp}
                  />
                  <PressableScale onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
                    <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
                  </PressableScale>
                </View>
              </View>
            </View>

            {!!error && (
              <View style={[s.errorBanner, {backgroundColor: colors.errorLight, borderColor: colors.error + '40'}]}>
                <Icon name="alert" size={15} color={colors.error} />
                <Text style={[s.errorTxt, {color: colors.error}]}>{error}</Text>
              </View>
            )}

            <PressableScale onPress={handleSignUp} disabled={loading}>
              <LinearGradient
                colors={loading ? ['#94A3B8', '#94A3B8'] : BRAND_GRADIENT}
                style={s.loginBtn}
                start={{x: 0, y: 0}} end={{x: 1, y: 0}}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <><Text style={s.loginBtnTxt}>Create Account</Text><Icon name="arrowRight" size={20} color="#fff" style={{marginLeft: 8}} /></>
                }
              </LinearGradient>
            </PressableScale>

            <PressableScale style={s.backRow} onPress={() => navigation.goBack()}>
              <Text style={[s.backTxt, {color: colors.textMuted}]}>Already have an account? <Text style={{color: colors.primary, fontWeight: '800'}}>Sign In</Text></Text>
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
  hero: {paddingTop: 56, paddingBottom: 48, paddingHorizontal: 24, alignItems: 'center'},
  logoRing: {width: 84, height: 84, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)'},
  heroTitle: {color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: -0.5},
  heroSub: {color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 6, fontWeight: '500'},

  card: {margin: 20, marginTop: -24, borderRadius: 24, borderWidth: 1, padding: 24, shadowColor: '#000', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.12, shadowRadius: 24, elevation: 12},
  cardTitle: {fontSize: 22, fontWeight: '900', marginBottom: 4},
  cardSub: {fontSize: 13, marginBottom: 24},

  fields: {gap: 16},
  field: {gap: 8},
  label: {fontSize: 11, fontWeight: '800', letterSpacing: 1},
  inputWrap: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 54, gap: 10},
  input: {flex: 1, fontSize: 15, fontWeight: '600'},
  eyeBtn: {padding: 4},
  errorBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, borderRadius: 12, borderWidth: 1, padding: 12},
  errorTxt: {fontSize: 13, fontWeight: '600'},
  loginBtn: {borderRadius: 16, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20},
  loginBtnTxt: {color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5},

  backRow: {alignItems: 'center', marginTop: 18},
  backTxt: {fontSize: 13, fontWeight: '600'},
});
