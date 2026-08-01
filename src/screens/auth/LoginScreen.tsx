import React, {useState, useRef, useEffect, useCallback} from 'react';
import {View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated} from 'react-native';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT} from '../../theme/colors';
import {Icon} from '../../components/Icon';
import {APP_VERSION_NAME} from '../../config/version';

// Quick-login: remembers accounts you've actually signed into on THIS
// device so switching roles while testing doesn't mean retyping a
// password every time. Stored in plain AsyncStorage (device-local, not
// synced anywhere) — a deliberate convenience tradeoff for internal
// testing, not something to rely on for real end-user credential storage.
const SAVED_ACCOUNTS_KEY = '@saved_accounts';

interface SavedAccount {
  username: string;
  password: string;
  role: string;
  name: string;
}

async function loadSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(SAVED_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function rememberAccount(account: SavedAccount) {
  const existing = await loadSavedAccounts();
  const next = [account, ...existing.filter(a => a.username.toLowerCase() !== account.username.toLowerCase())].slice(0, 8);
  await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
}

async function forgetAccount(username: string) {
  const existing = await loadSavedAccounts();
  await AsyncStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(existing.filter(a => a.username !== username)));
}

export function LoginScreen({navigation}: {navigation: any}) {
  const {login} = useAuth();
  const {colors, isDark} = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const shake = useRef(new Animated.Value(0)).current;
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    loadSavedAccounts().then(setSavedAccounts);
  }, []);

  const triggerShake = () => {
    Animated.sequence([
      Animated.timing(shake, {toValue: 10, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: -10, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: 6, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: -6, duration: 60, useNativeDriver: true}),
      Animated.timing(shake, {toValue: 0, duration: 60, useNativeDriver: true}),
    ]).start();
  };

  const doLogin = useCallback(async (u: string, p: string) => {
    setError('');
    if (!u.trim() || !p) {
      setError('Username and password are required');
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      const loggedIn = await login(u.trim(), p);
      await rememberAccount({
        username: u.trim(), password: p,
        role: loggedIn?.role ?? '', name: loggedIn?.name ?? u.trim(),
      });
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
      triggerShake();
    } finally {
      setLoading(false);
    }
  }, [login]);

  const handleLogin = () => doLogin(username, password);

  const handleQuickLogin = (account: SavedAccount) => {
    setUsername(account.username);
    setPassword(account.password);
    doLogin(account.username, account.password);
  };

  const handleForget = async (account: SavedAccount) => {
    await forgetAccount(account.username);
    setSavedAccounts(await loadSavedAccounts());
  };

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
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

            {/* Quick Login — accounts you've signed into before on this
                device, one tap to switch roles without retyping. */}
            {savedAccounts.length > 0 && (
              <View style={s.quickWrap}>
                <Text style={[s.quickLabel, {color: colors.textMuted}]}>QUICK LOGIN</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.quickRow}>
                  {savedAccounts.map(acc => (
                    <PressableScale
                      key={acc.username}
                      style={[s.quickChip, {backgroundColor: isDark ? colors.card : '#F8FAFF', borderColor: colors.border}]}
                      onPress={() => handleQuickLogin(acc)}
                    >
                      <View style={[s.quickAvatar, {backgroundColor: colors.primary}]}>
                        <Text style={[s.quickAvatarTxt, {color: colors.textOnPrimary}]}>{acc.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View>
                        <Text style={[s.quickName, {color: colors.textPrimary}]} numberOfLines={1}>{acc.name}</Text>
                        <Text style={[s.quickRole, {color: colors.textMuted}]}>{acc.role}</Text>
                      </View>
                      <PressableScale onPress={() => handleForget(acc)} style={s.quickRemove}>
                        <Icon name="close" size={12} color={colors.textMuted} />
                      </PressableScale>
                    </PressableScale>
                  ))}
                </ScrollView>
              </View>
            )}

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
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={t => { setPassword(t); setError(''); }}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
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

            <PressableScale style={s.keepRow} onPress={() => setKeepSignedIn(k => !k)}>
              <View style={[s.checkbox, {borderColor: colors.primary, backgroundColor: keepSignedIn ? colors.primary : 'transparent'}]}>
                {keepSignedIn && <Icon name="checkBold" size={13} color="#fff" />}
              </View>
              <View>
                <Text style={[s.keepTitle, {color: colors.textPrimary}]}>Keep me signed in for 12 hours</Text>
                <Text style={[s.keepSub, {color: colors.textMuted}]}>You will stay signed in for your full shift</Text>
              </View>
            </PressableScale>

            <PressableScale onPress={handleLogin} disabled={loading}>
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
            </PressableScale>

            <PressableScale style={s.signUpRow} onPress={() => navigation.navigate('SignUp')}>
              <Text style={[s.signUpTxt, {color: colors.textMuted}]}>New here? <Text style={{color: colors.primary, fontWeight: '800'}}>Create an account</Text></Text>
            </PressableScale>

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

  card: {margin: 20, marginTop: -24, borderRadius: 24, borderWidth: 1, padding: 24, shadowColor: '#000', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.12, shadowRadius: 24, elevation: 12},
  cardTitle: {fontSize: 22, fontWeight: '900', marginBottom: 4},
  cardSub: {fontSize: 13, marginBottom: 24},
  quickWrap: {marginBottom: 20},
  quickLabel: {fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 10},
  quickRow: {gap: 10, paddingRight: 4},
  quickChip: {flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10, paddingRight: 22},
  quickAvatar: {width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  quickAvatarTxt: {fontSize: 13, fontWeight: '800'},
  quickName: {fontSize: 12, fontWeight: '700', maxWidth: 110},
  quickRole: {fontSize: 10, marginTop: 1, textTransform: 'capitalize'},
  quickRemove: {position: 'absolute', top: 4, right: 4, padding: 2},

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

  signUpRow: {alignItems: 'center', marginTop: 18},
  signUpTxt: {fontSize: 13, fontWeight: '600'},

  keepRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18},
  checkbox: {width: 20, height: 20, borderRadius: 5, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1},
  keepTitle: {fontSize: 13, fontWeight: '700'},
  keepSub: {fontSize: 11, marginTop: 2},

  footer: {alignItems: 'center', paddingBottom: 8, gap: 6},
  footerBadge: {flexDirection: 'row', alignItems: 'center', gap: 6},
  footerBadgeTxt: {fontSize: 11, fontWeight: '600'},
  version: {textAlign: 'center', fontSize: 10},
});
