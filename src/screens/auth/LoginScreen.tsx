import React, {useState, useRef, useEffect, useCallback} from 'react';
import {View, Text, TextInput, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Animated} from 'react-native';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {useAuth} from '../../context/AuthContext';
import {useTheme} from '../../context/ThemeContext';
import {BRAND_GRADIENT, BRAND_GRADIENT_DARK} from '../../theme/colors';
import {Icon} from '../../components/Icon';
import {APP_VERSION_NAME} from '../../config/version';

// Quick-login: remembers accounts you've actually signed into on THIS
// device so switching roles while testing doesn't mean retyping a
// password every time. Stored in plain AsyncStorage (device-local, not
// synced anywhere) — a deliberate convenience tradeoff for internal
// testing, not something to rely on for real end-user credential storage.
const SAVED_ACCOUNTS_KEY = '@saved_accounts';

// How many saved accounts show before "Show all" — X's login shows two
// rows then a divider; more than a few full-width rows pushes the actual
// username/password fields off-screen, which is the opposite of helpful.
const VISIBLE_ACCOUNTS = 3;

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

export function LoginScreen() {
  const {login} = useAuth();
  const {colors, isDark} = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [forgetting, setForgetting] = useState<string | null>(null);
  const [focused, setFocused] = useState<'username' | 'password' | null>(null);
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
    if (loading) return;
    setUsername(account.username);
    setPassword(account.password);
    doLogin(account.username, account.password);
  };

  const handleForget = async (account: SavedAccount) => {
    if (forgetting) return;
    setForgetting(account.username);
    try {
      await forgetAccount(account.username);
      setSavedAccounts(await loadSavedAccounts());
    } finally {
      setForgetting(null);
    }
  };

  const gradient = isDark ? BRAND_GRADIENT_DARK : BRAND_GRADIENT;
  // Warm neutral, from the palette — the old hardcoded '#F8FAFF' was a cool
  // blue-white, the one cool tone in an otherwise entirely warm-mono app.
  const fieldFill = isDark ? colors.card : colors.cardAlt;
  const visibleAccounts = showAllAccounts ? savedAccounts : savedAccounts.slice(0, VISIBLE_ACCOUNTS);

  return (
    <SafeAreaView edges={['left', 'right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{flex: 1}}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Hero — the brand gradient every other screen's header uses.
              The mark is a solid light tile rather than the old translucent
              ring: a confident app-icon-like shape reads as a real brand,
              a 20%-white box with a 30%-white border reads as a placeholder. */}
          <LinearGradient colors={gradient} style={s.hero} start={{x: 0, y: 0}} end={{x: 1, y: 1}}>
            <View style={s.logoTile}>
              <Icon name="parking" size={38} color="#15161A" />
            </View>
            <Text style={s.heroTitle}>KIMS Hospital</Text>
            <Text style={s.heroSub}>Smart Parking Management</Text>
          </LinearGradient>

          {/* Login card */}
          <Animated.View style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border, transform: [{translateX: shake}]}]}>
            <Text style={[s.cardTitle, {color: colors.textPrimary}]}>Welcome back</Text>
            <Text style={[s.cardSub, {color: colors.textMuted}]}>Sign in to continue your shift</Text>

            {/* Saved accounts — full-width rows, not cramped horizontal
                chips with an × overlapping the corner. Mobbin reference:
                X's "Continue with your existing accounts" and Duolingo's
                device-account picker both use exactly this shape (avatar,
                name + secondary line, remove action on the right). */}
            {savedAccounts.length > 0 && (
              <View style={s.quickWrap}>
                <Text style={[s.sectionLabel, {color: colors.textSecondary}]}>Continue as</Text>
                <View style={[s.accountGroup, {borderColor: colors.border}]}>
                  {visibleAccounts.map((acc, i) => (
                    <View
                      key={acc.username}
                      style={[s.accountRow, i < visibleAccounts.length - 1 && {borderBottomWidth: 1, borderBottomColor: colors.divider}]}
                    >
                      <PressableScale
                        style={[s.accountMain, {opacity: loading ? 0.5 : 1}]}
                        onPress={() => handleQuickLogin(acc)}
                        disabled={loading}
                      >
                        <View style={[s.accountAvatar, {backgroundColor: colors.primary}]}>
                          <Text style={[s.accountAvatarTxt, {color: colors.textOnPrimary}]}>{acc.name[0]?.toUpperCase()}</Text>
                        </View>
                        <View style={{flex: 1, minWidth: 0}}>
                          <Text style={[s.accountName, {color: colors.textPrimary}]} numberOfLines={1}>{acc.name}</Text>
                          <Text style={[s.accountRole, {color: colors.textMuted}]} numberOfLines={1}>{acc.role || acc.username}</Text>
                        </View>
                      </PressableScale>
                      <PressableScale
                        onPress={() => handleForget(acc)}
                        style={s.accountRemove}
                        disabled={forgetting === acc.username || loading}
                        hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                      >
                        {forgetting === acc.username
                          ? <ActivityIndicator size="small" color={colors.textMuted} />
                          : <Icon name="close" size={16} color={colors.textMuted} />}
                      </PressableScale>
                    </View>
                  ))}
                </View>
                {savedAccounts.length > VISIBLE_ACCOUNTS && (
                  <PressableScale onPress={() => setShowAllAccounts(v => !v)} style={s.showAllBtn}>
                    <Text style={[s.showAllTxt, {color: colors.textSecondary}]}>
                      {showAllAccounts ? 'Show fewer' : `Show all ${savedAccounts.length} accounts`}
                    </Text>
                  </PressableScale>
                )}
              </View>
            )}

            {/* Fields — no leading icon inside the input. Every premium
                reference (Gymshark, Peacock, Grill'd) uses a clean field;
                an icon in a box on the left is 2015-era chrome that adds
                nothing a label above the field doesn't already say. */}
            <View style={s.fields}>
              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>Username</Text>
                <View style={[
                  s.inputWrap,
                  {backgroundColor: fieldFill, borderColor: error ? colors.error : focused === 'username' ? colors.primary : 'transparent'},
                ]}>
                  <TextInput
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="e.g. Dr. Aditya Sharma"
                    placeholderTextColor={colors.textMuted}
                    value={username}
                    onChangeText={t => { setUsername(t); setError(''); }}
                    onFocus={() => setFocused('username')}
                    onBlur={() => setFocused(null)}
                    autoCapitalize="words"
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                  />
                </View>
              </View>

              <View style={s.field}>
                <Text style={[s.label, {color: colors.textSecondary}]}>Password</Text>
                <View style={[
                  s.inputWrap,
                  {backgroundColor: fieldFill, borderColor: error ? colors.error : focused === 'password' ? colors.primary : 'transparent'},
                ]}>
                  <TextInput
                    ref={passwordRef}
                    style={[s.input, {color: colors.textPrimary}]}
                    placeholder="Enter your password"
                    placeholderTextColor={colors.textMuted}
                    value={password}
                    onChangeText={t => { setPassword(t); setError(''); }}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    secureTextEntry={!showPass}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
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

            <PressableScale style={s.keepRow} onPress={() => setKeepSignedIn(k => !k)}>
              <View style={[s.checkbox, {borderColor: keepSignedIn ? colors.primary : colors.border, backgroundColor: keepSignedIn ? colors.primary : 'transparent'}]}>
                {keepSignedIn && <Icon name="checkBold" size={12} color={colors.textOnPrimary} />}
              </View>
              <View style={{flex: 1}}>
                <Text style={[s.keepTitle, {color: colors.textPrimary}]}>Keep me signed in for 12 hours</Text>
                <Text style={[s.keepSub, {color: colors.textMuted}]}>Covers a full shift without signing in again</Text>
              </View>
            </PressableScale>

            {/* Solid, not a gradient — matches every other primary CTA in
                the app (Add Staff, Assign Driver, Mark Parked) and reads
                more decisive than a near-black-to-black ramp nobody can
                actually see. */}
            <PressableScale
              onPress={handleLogin}
              disabled={loading}
              style={[s.loginBtn, {backgroundColor: colors.primary, opacity: loading ? 0.65 : 1}]}
            >
              {loading
                ? <ActivityIndicator color={colors.textOnPrimary} />
                : <>
                    <Text style={[s.loginBtnTxt, {color: colors.textOnPrimary}]}>Sign In</Text>
                    <Icon name="arrowRight" size={19} color={colors.textOnPrimary} />
                  </>
              }
            </PressableScale>
          </Animated.View>

          <View style={s.footer}>
            <View style={s.footerBadge}>
              <Icon name="shield" size={13} color={colors.textMuted} />
              <Text style={[s.footerBadgeTxt, {color: colors.textMuted}]}>Secure enterprise login</Text>
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

  sectionLabel: {fontSize: 13, fontWeight: '700', marginBottom: 10},
  quickWrap: {marginBottom: 26},
  accountGroup: {borderRadius: 18, borderWidth: 1, overflow: 'hidden'},
  accountRow: {flexDirection: 'row', alignItems: 'center'},
  accountMain: {flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14},
  accountAvatar: {width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center'},
  accountAvatarTxt: {fontSize: 15, fontWeight: '800'},
  accountName: {fontSize: 14.5, fontWeight: '700'},
  accountRole: {fontSize: 12, marginTop: 2, textTransform: 'capitalize'},
  accountRemove: {paddingHorizontal: 16, paddingVertical: 18},
  showAllBtn: {alignSelf: 'flex-start', paddingVertical: 10},
  showAllTxt: {fontSize: 13, fontWeight: '700'},

  fields: {gap: 18},
  field: {gap: 9},
  label: {fontSize: 13, fontWeight: '700'},
  // Fill-first, border only on focus/error — a resting field is a calm
  // surface, and the border appears exactly when it means something.
  inputWrap: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, height: 56, gap: 10},
  input: {flex: 1, fontSize: 15.5, fontWeight: '600', padding: 0},
  eyeBtn: {padding: 2},

  errorBanner: {flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, borderRadius: 14, padding: 13},
  errorTxt: {flex: 1, fontSize: 13, fontWeight: '600'},

  keepRow: {flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 22},
  checkbox: {width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1},
  keepTitle: {fontSize: 13.5, fontWeight: '700'},
  keepSub: {fontSize: 12, marginTop: 2},

  loginBtn: {borderRadius: 999, height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 26},
  loginBtnTxt: {fontSize: 16, fontWeight: '800'},

  footer: {alignItems: 'center', paddingBottom: 8, gap: 6},
  footerBadge: {flexDirection: 'row', alignItems: 'center', gap: 6},
  footerBadgeTxt: {fontSize: 11.5, fontWeight: '600'},
  version: {textAlign: 'center', fontSize: 10.5},
});
