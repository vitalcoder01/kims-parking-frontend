import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, StyleSheet, Modal, Animated, Easing, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {PressableScale} from './PressableScale';
import {Icon} from './Icon';
import {typography, spacing, radius} from '../theme';
import {usersApi} from '../services/api';

export type EditProfileMode = 'name' | 'username' | 'password';

// Same validation the backend enforces, mirrored here so the user gets a
// red field before hitting Save rather than a 400 after. Server is still
// the source of truth — these are ONLY for inline feedback.
const NAME_MIN = 2, NAME_MAX = 64;
const USERNAME_MIN = 3, USERNAME_MAX = 40;
const PASSWORD_MIN = 8, PASSWORD_MAX = 64;

const NAME_ALLOWED = /^[\p{L}\p{M} .'\-]+$/u;
const USERNAME_ALLOWED = /^[\p{L}\p{N} .]+$/u;

function validateName(v: string): string | null {
  const t = v.trim();
  if (t.length < NAME_MIN) return `Name must be at least ${NAME_MIN} characters`;
  if (t.length > NAME_MAX) return `Name must be ${NAME_MAX} characters or fewer`;
  if (!NAME_ALLOWED.test(t)) return "Only letters, spaces, and . ' - are allowed";
  if (/\s{2,}/.test(t)) return 'No consecutive spaces';
  return null;
}
function validateUsername(v: string): string | null {
  const t = v.trim();
  if (t.length < USERNAME_MIN) return `Username must be at least ${USERNAME_MIN} characters`;
  if (t.length > USERNAME_MAX) return `Username must be ${USERNAME_MAX} characters or fewer`;
  if (!USERNAME_ALLOWED.test(t)) return 'Only letters, numbers, spaces, and dots';
  if (/\s{2,}/.test(t)) return 'No consecutive spaces';
  return null;
}

// Password strength meter — purely advisory, purely local. Doesn't gate
// Save (the backend's 8-char minimum does), just tells the user how strong
// what they typed is so they can make a better choice if they want to.
function passwordStrength(pw: string): {score: 0 | 1 | 2 | 3 | 4; label: string; color: 'error' | 'warning' | 'success'} {
  if (!pw) return {score: 0, label: '', color: 'error'};
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  if (clamped <= 1) return {score: clamped, label: 'Weak', color: 'error'};
  if (clamped === 2) return {score: clamped, label: 'Fair', color: 'warning'};
  if (clamped === 3) return {score: clamped, label: 'Good', color: 'success'};
  return {score: clamped, label: 'Strong', color: 'success'};
}

type Props = {
  visible: boolean;
  mode: EditProfileMode | null;
  onClose: () => void;
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
};

// One sheet, three modes. Kept as a single component because they all share
// the animation, the outer chrome, the keyboard handling, and the same
// "guard against a double-tap-save while a request is in flight" pattern —
// splitting into three would be three copies of that harness for what only
// differs in the middle.
export function EditProfileSheet({visible, mode, onClose, onSuccess, onError}: Props) {
  const {colors, isDark} = useTheme();
  const {user, updateProfile} = useAuth();
  const [rendered, setRendered] = useState(visible);

  // Slide-up animation for the sheet + fade for the backdrop, driven by
  // the same value so they can never disagree about how far along the
  // transition is.
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setRendered(true);
      const raf = requestAnimationFrame(() => {
        anim.setValue(0);
        Animated.timing(anim, {toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start();
      });
      return () => cancelAnimationFrame(raf);
    }
    Animated.timing(anim, {toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true})
      .start(() => setRendered(false));
  }, [visible, anim]);

  // Field state. Reset every time the sheet opens with a fresh mode, so a
  // half-typed value from one flow can't leak into the next.
  const [nameValue, setNameValue] = useState('');
  const [usernameValue, setUsernameValue] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // "Fresh mode" = the sheet just opened (visible went false→true) with a
  // specific mode. React runs this before paint, so the user never sees a
  // stale value flash before their own fresh field.
  useEffect(() => {
    if (!visible) return;
    setNameValue(user?.name ?? '');
    setUsernameValue(user?.username ?? '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false); setShowNew(false); setShowConfirm(false);
    setServerError(null);
    setSaving(false);
    // Intentionally not depending on user — a mid-edit remote user update
    // would clobber what the user is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode]);

  if (!rendered || !mode) return null;

  const title = mode === 'name' ? 'Edit Name' : mode === 'username' ? 'Change Username' : 'Change Password';
  const iconName = mode === 'name' ? 'user' : mode === 'username' ? 'userCard' : 'lock';

  // Per-mode client-side validation summary. Save button disabled purely
  // off this + the "no in-flight request" guard, so a user can never
  // submit a form the server would immediately 400 on.
  let clientError: string | null = null;
  let canSubmit = false;
  if (mode === 'name') {
    clientError = validateName(nameValue);
    const changed = nameValue.trim() !== (user?.name ?? '').trim();
    canSubmit = !clientError && changed;
  } else if (mode === 'username') {
    clientError = validateUsername(usernameValue);
    const changed = usernameValue.trim() !== (user?.username ?? '').trim();
    canSubmit = !clientError && changed;
  } else {
    if (!currentPassword) clientError = 'Enter your current password';
    else if (newPassword.length < PASSWORD_MIN) clientError = `New password must be at least ${PASSWORD_MIN} characters`;
    else if (newPassword.length > PASSWORD_MAX) clientError = `New password must be ${PASSWORD_MAX} characters or fewer`;
    else if (newPassword === currentPassword) clientError = 'New password must be different from the current one';
    else if (newPassword !== confirmPassword) clientError = "Passwords don't match";
    canSubmit = !clientError;
  }

  const handleSave = async () => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      if (mode === 'name') {
        const updated = await usersApi.updateMe({name: nameValue.trim()});
        updateProfile({name: updated.name});
        onSuccess?.('Name updated');
      } else if (mode === 'username') {
        const updated = await usersApi.updateMe({username: usernameValue.trim()});
        updateProfile({username: updated.username});
        onSuccess?.('Username updated');
      } else {
        await usersApi.changeMyPassword(currentPassword, newPassword);
        onSuccess?.('Password updated');
      }
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || 'Something went wrong';
      setServerError(msg);
      // Also surface a top-level toast for password rate-limit / 401 cases
      // that the user might miss inside the sheet.
      if (err?.response?.status === 429 || err?.response?.status === 401) {
        onError?.(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const backdropOpacity = anim;
  const sheetTranslateY = anim.interpolate({inputRange: [0, 1], outputRange: [500, 0]});

  const showError = serverError ?? clientError;
  const errorVisible = !!(serverError || (clientError && (
    // Only show client error once the user has interacted meaningfully —
    // an empty confirm-password field on first render shouldn't scream
    // red at them.
    (mode === 'name' && nameValue !== (user?.name ?? '')) ||
    (mode === 'username' && usernameValue !== (user?.username ?? '')) ||
    (mode === 'password' && (currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0))
  )));

  const strength = mode === 'password' ? passwordStrength(newPassword) : null;
  const strengthColor = strength ? (strength.color === 'error' ? colors.error : strength.color === 'warning' ? colors.warning : colors.success) : undefined;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={[s.backdrop, {opacity: backdropOpacity, backgroundColor: isDark ? 'rgba(0,0,0,0.65)' : 'rgba(0,0,0,0.5)'}]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onClose} />
      </Animated.View>

      <KeyboardAvoidingView
        style={s.wrap}
        pointerEvents="box-none"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View
          style={[
            s.sheet,
            {backgroundColor: colors.background, borderColor: colors.border, transform: [{translateY: sheetTranslateY}]},
          ]}>
          <View style={s.handle} />
          <View style={s.headerRow}>
            <View style={[s.iconChip, {backgroundColor: colors.primaryLight}]}>
              <Icon name={iconName as any} size={18} color={colors.primary} />
            </View>
            <Text style={[s.title, {color: colors.textPrimary}]}>{title}</Text>
            <PressableScale style={[s.closeBtn, {backgroundColor: colors.cardAlt}]} onPress={onClose} disabled={saving}>
              <Icon name="close" size={16} color={colors.textPrimary} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {mode === 'name' && (
              <Field
                label="Display name"
                value={nameValue}
                onChangeText={setNameValue}
                placeholder="Your full name"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={NAME_MAX}
                colors={colors}
                helper={`${nameValue.trim().length}/${NAME_MAX}`}
                autoFocus
              />
            )}

            {mode === 'username' && (
              <>
                <Field
                  label="Login username"
                  value={usernameValue}
                  onChangeText={setUsernameValue}
                  placeholder="What you type to log in"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={USERNAME_MAX}
                  colors={colors}
                  helper={`${usernameValue.trim().length}/${USERNAME_MAX}`}
                  autoFocus
                />
                <Text style={[s.note, {color: colors.textMuted}]}>
                  This is what you'll type on the login screen. Must be unique.
                </Text>
              </>
            )}

            {mode === 'password' && (
              <>
                <PasswordField
                  label="Current password"
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  reveal={showCurrent}
                  onToggleReveal={() => setShowCurrent(v => !v)}
                  colors={colors}
                  autoFocus
                />
                <PasswordField
                  label="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  reveal={showNew}
                  onToggleReveal={() => setShowNew(v => !v)}
                  colors={colors}
                  helper={`${newPassword.length}/${PASSWORD_MAX}`}
                />
                {newPassword.length > 0 && strength && strengthColor && (
                  <View style={s.strengthWrap}>
                    <View style={s.strengthTrack}>
                      {[1, 2, 3, 4].map(step => (
                        <View
                          key={step}
                          style={[
                            s.strengthSeg,
                            {backgroundColor: step <= strength.score ? strengthColor : colors.cardAlt},
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[s.strengthLabel, {color: strengthColor}]}>{strength.label}</Text>
                  </View>
                )}
                <PasswordField
                  label="Confirm new password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  reveal={showConfirm}
                  onToggleReveal={() => setShowConfirm(v => !v)}
                  colors={colors}
                />
                <View style={[s.tipBox, {backgroundColor: colors.cardAlt, borderColor: colors.border}]}>
                  <Icon name="shield" size={14} color={colors.textSecondary} />
                  <Text style={[s.tipTxt, {color: colors.textSecondary}]}>
                    Use at least 8 characters. Mixing upper and lower case, numbers, and symbols makes it stronger.
                  </Text>
                </View>
              </>
            )}

            {errorVisible && showError && (
              <View style={[s.errorBox, {backgroundColor: colors.errorLight, borderColor: colors.error + '55'}]}>
                <Icon name="alert" size={14} color={colors.error} />
                <Text style={[s.errorTxt, {color: colors.error}]}>{showError}</Text>
              </View>
            )}
          </ScrollView>

          <View style={[s.footer, {borderTopColor: colors.divider}]}>
            <PressableScale
              onPress={onClose}
              disabled={saving}
              style={[s.footerBtn, {backgroundColor: colors.cardAlt}]}>
              <Text style={[s.footerBtnTxt, {color: colors.textPrimary}]}>Cancel</Text>
            </PressableScale>
            <PressableScale
              onPress={handleSave}
              disabled={!canSubmit || saving}
              style={[
                s.footerBtn,
                s.footerBtnPrimary,
                {backgroundColor: canSubmit && !saving ? colors.primary : colors.cardAlt},
              ]}>
              {saving ? (
                <ActivityIndicator color={canSubmit ? colors.textOnPrimary : colors.textMuted} size="small" />
              ) : (
                <Text style={[s.footerBtnTxt, {color: canSubmit ? colors.textOnPrimary : colors.textMuted}]}>Save</Text>
              )}
            </PressableScale>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Plain text field used by the name/username modes. Extracted so the two
// call sites are visually identical without repeating the wrapper markup.
function Field({label, helper, colors, ...inputProps}: any) {
  return (
    <View style={s.fieldWrap}>
      <View style={s.fieldLabelRow}>
        <Text style={[s.fieldLabel, {color: colors.textMuted}]}>{label.toUpperCase()}</Text>
        {helper && <Text style={[s.fieldHelper, {color: colors.textMuted}]}>{helper}</Text>}
      </View>
      <View style={[s.fieldBox, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <TextInput
          {...inputProps}
          style={[s.fieldInput, {color: colors.textPrimary}]}
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </View>
  );
}

// Password variant with a reveal toggle. `secureTextEntry` flips off in
// sync with `reveal` so caps-lock hints and typos are recoverable —
// entering a long password blind is exactly the kind of thing that leads
// to "why doesn't my password work" support issues.
function PasswordField({label, value, onChangeText, reveal, onToggleReveal, helper, colors, autoFocus}: any) {
  return (
    <View style={s.fieldWrap}>
      <View style={s.fieldLabelRow}>
        <Text style={[s.fieldLabel, {color: colors.textMuted}]}>{label.toUpperCase()}</Text>
        {helper && <Text style={[s.fieldHelper, {color: colors.textMuted}]}>{helper}</Text>}
      </View>
      <View style={[s.fieldBox, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <TextInput
          style={[s.fieldInput, {color: colors.textPrimary, paddingRight: 40}]}
          value={value}
          onChangeText={onChangeText}
          placeholder="••••••••"
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!reveal}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="password"
          textContentType="password"
          maxLength={PASSWORD_MAX}
          autoFocus={autoFocus}
        />
        <PressableScale style={s.revealBtn} onPress={onToggleReveal} hitSlop={8}>
          <Icon name={reveal ? 'eyeOff' : 'eye'} size={18} color={colors.textMuted} />
        </PressableScale>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  wrap: {flex: 1, justifyContent: 'flex-end'},
  sheet: {borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, paddingTop: 8, maxHeight: '92%'},
  handle: {alignSelf: 'center', width: 44, height: 4, borderRadius: 2, backgroundColor: 'rgba(150,150,150,0.5)', marginBottom: 6},

  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingVertical: 12},
  iconChip: {width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  title: {flex: 1, fontSize: typography.sizes.md, fontWeight: typography.weights.black},
  closeBtn: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},

  body: {paddingHorizontal: 20, paddingTop: 6, paddingBottom: 20, gap: spacing.base},

  fieldWrap: {gap: 6},
  fieldLabelRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  fieldLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1.1},
  fieldHelper: {fontSize: 11, fontWeight: '600'},
  fieldBox: {borderRadius: radius.md, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center'},
  fieldInput: {flex: 1, fontSize: 15, fontWeight: '600', paddingHorizontal: 14, paddingVertical: 12},
  revealBtn: {position: 'absolute', right: 6, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8},

  note: {fontSize: 12, lineHeight: 17, marginTop: -4},

  strengthWrap: {flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4},
  strengthTrack: {flexDirection: 'row', flex: 1, gap: 4},
  strengthSeg: {flex: 1, height: 4, borderRadius: 2},
  strengthLabel: {fontSize: 11, fontWeight: '800', minWidth: 42, textAlign: 'right'},

  tipBox: {flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'flex-start'},
  tipTxt: {flex: 1, fontSize: 11.5, lineHeight: 16},

  errorBox: {flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1, alignItems: 'flex-start'},
  errorTxt: {flex: 1, fontSize: 12, fontWeight: '700', lineHeight: 16},

  footer: {flexDirection: 'row', gap: 10, padding: 16, borderTopWidth: 1},
  footerBtn: {flex: 1, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  footerBtnPrimary: {},
  footerBtnTxt: {fontSize: 14, fontWeight: '800'},
});
