import React, {useState, useRef} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT} from '../../theme/colors';
import {Icon} from '../../components/Icon';
import {APP_VERSION_NAME} from '../../config/version';

export function LoginScreen() {
  const {login} = useAuth();
  const {colors, isDark} = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const shake = useRef(new Animated.Value(0)).current;

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shake, {toValue: 10, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: -10, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: 6, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: -6, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: 0, duration: 60, useNativeDriver: true}),
    ]).start();
  };

  const handleLogin = async () => {
    setError('');
    if (!username.trim() || !password) {
      setError('Username and password are required');
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: isDark ? '#070C1A' : '#EEF2FF'}]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Hero gradient header */}
          <LinearGradient colors={BRAND_GRADIENT} style={s.hero} start={{x: 0, y: 0}} end={{x: 1, y: 1}}>
            <View style={s.logoRing}>
              <Icon name="parking" size={44} color="#fff" />
            </View>
            <Text style={s.heroTitle}>KIMS Hospital</Text>
            <Text style={s.heroSub}>Smart Parking Management System</Text>
          </LinearGradient>

          {/* Login card */}
          <Animated.View style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border, transform: [{translateX: shake}]}]}>
            <Text style={[s.cardTitle, {color: colors.textPrimary}]}>Welcome Back</Text>
            <Text style={[s.cardSub, {color: colors.textMuted}]}>Sign in to continue your shift</Text>

            <View style={s.fields}>
              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>USERNAME</Text>
                <View style={[s.inputWrap, {borderColor: error ? colors.error : colors.border, backgroundColor: isDark ? colors.card : '#F8FAFF'}]}>
                  <Icon name="userCard" size={18} color={colors.textMuted} style={{marginRight: 4}} />
                  <TextInput
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="e.g. Dr. Aditya Sharma"
                    placeholderTextColor={colors.textMuted}
                    value={username}
                    onChangeText={t => { setUsername(t); setError(''); }}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>PASSWORD</Text>
                <View style={[s.inputWrap, {borderColor: error ? colors.error : colors.border, backgroundColor: isDark ? colors.card : '#F8FAFF'}]}>
                  <Icon name="lock" size={18} color={colors.textMuted} style={{marginRight: 4}} />
                  <TextInput
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={t => { setPassword(t); setError(''); }}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity onPress={() => setShowPass(p => !p)} style={s.eyeBtn}>
                    <Icon name={showPass ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {!!error && (
              <View style={[s.errorBanner, {backgroundColor: colors.errorLight, borderColor: colors.error + '40'}]}>
                <Text style={[s.errorTxt, {color: colors.error}]}>⚠  {error}</Text>
              </View>
            )}

            <TouchableOpacity style={s.keepRow} onPress={() => setKeepSignedIn(k => !k)} activeOpacity={0.7}>
              <View style={[s.checkbox, {borderColor: colors.primary, backgroundColor: keepSignedIn ? colors.primary : 'transparent'}]}>
                {keepSignedIn && <Icon name="checkBold" size={13} color="#fff" />}
              </View>
              <View>
                <Text style={[s.keepTitle, {color: colors.textPrimary}]}>Keep me signed in for 12 hours</Text>
                <Text style={[s.keepSub, {color: colors.textMuted}]}>You will stay signed in for your full shift</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.88}>
              <LinearGradient
                colors={loading ? ['#94A3B8', '#94A3B8'] : BRAND_GRADIENT}
                style={s.loginBtn}
                start={{x: 0, y: 0}} end={{x: 1, y: 0}}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <><Text style={s.loginBtnTxt}>Sign In</Text><Icon name="arrowRight" size={20} color="#fff" style={{marginLeft: 8}} /></>
                }
              </LinearGradient>
            </TouchableOpacity>

          </Animated.View>

          <View style={s.footer}>
            <View style={s.footerBadge}>
              <Icon name="shield" size={13} color={colors.textMuted} />
              <Text style={[s.footerBadgeTxt, {color: colors.textMuted}]}>Secure Enterprise Login</Text>
            </View>
            <Text style={[s.version, {color: colors.textMuted}]}>KIMS Parking System v{APP_VERSION_NAME}</Text>
          </View>
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

  card: {margin: 20, marginTop: -24, borderRadius: 24, borderWidth: 1, padding: 24, shadowColor: '#4F46E5', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.15, shadowRadius: 24, elevation: 12},
  cardTitle: {fontSize: 22, fontWeight: '900', marginBottom: 4},
  cardSub: {fontSize: 13, marginBottom: 24},
  fields: {gap: 16},
  field: {gap: 8},
  label: {fontSize: 11, fontWeight: '800', letterSpacing: 1},
  inputWrap: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14, height: 54, gap: 10},
  input: {flex: 1, fontSize: 15, fontWeight: '600'},
  eyeBtn: {padding: 4},
  errorBanner: {marginTop: 16, borderRadius: 12, borderWidth: 1, padding: 12},
  errorTxt: {fontSize: 13, fontWeight: '600'},
  loginBtn: {borderRadius: 16, height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20},
  loginBtnTxt: {color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5},

  keepRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18},
  checkbox: {width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1},
  keepTitle: {fontSize: 13, fontWeight: '700'},
  keepSub: {fontSize: 11, marginTop: 2},

  footer: {alignItems: 'center', paddingBottom: 8, gap: 6},
  footerBadge: {flexDirection: 'row', alignItems: 'center', gap: 6},
  footerBadgeTxt: {fontSize: 11, fontWeight: '600'},
  version: {textAlign: 'center', fontSize: 10},
});
