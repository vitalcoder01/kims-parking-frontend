import React, {useState, useEffect, useCallback, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, BackHandler} from 'react-native';
import {useDialog} from '../../components/AppDialog';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../../context/ThemeContext';
import {adminApi} from '../../services/api';
import {Badge} from '../../components/Badge';
import {Icon} from '../../components/Icon';

type Filter = 'all' | 'doctor' | 'staff' | 'valet' | 'driver' | 'admin';
type Role = 'doctor' | 'staff' | 'valet' | 'driver' | 'admin';

interface AdminUser {
  id: number;
  employeeId: string;
  username: string;
  name: string;
  role: Role;
  department?: string;
  cardCode?: string;
  phone?: string;
  driverStatus?: 'available' | 'busy' | 'off';
}

const FILTER_TABS: {key: Filter; label: string}[] = [
  {key: 'all',    label: 'All'},
  {key: 'doctor', label: 'Doctors'},
  {key: 'staff',  label: 'Staff'},
  {key: 'valet',  label: 'Valets'},
  {key: 'driver', label: 'Drivers'},
  {key: 'admin',  label: 'Admins'},
];

const ROLE_OPTIONS: {key: Role; label: string; icon: any}[] = [
  {key: 'doctor', label: 'Doctor', icon: 'user'},
  {key: 'staff',  label: 'Staff',  icon: 'userCard'},
  {key: 'valet',  label: 'Valet',  icon: 'key'},
  {key: 'driver', label: 'Driver', icon: 'car'},
  {key: 'admin',  label: 'Admin',  icon: 'shield'},
];

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function AdminStaffScreen() {
  const dialog = useDialog();
  const {colors} = useTheme();
  const [filter, setFilter] = useState<Filter>('all');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);

  // Add/edit-staff form state — shared by both flows (see editingUser).
  const [name, setName] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [role, setRole] = useState<Role>('staff');
  const [password, setPassword] = useState(genPassword());
  const [department, setDepartment] = useState('');
  const [cardCode, setCardCode] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  // Return-key chaining — role-dependent fields aren't always mounted, so
  // "next" focuses the first ref in the candidate list that actually exists.
  const empIdRef = useRef<TextInput | null>(null);
  const deptRef = useRef<TextInput | null>(null);
  const cardCodeRef = useRef<TextInput | null>(null);
  const phoneRef = useRef<TextInput | null>(null);
  const focusFirst = (...refs: React.MutableRefObject<TextInput | null>[]) => {
    for (const r of refs) if (r.current) { r.current.focus(); return; }
  };

  const loadUsers = useCallback(async () => {
    try {
      const list = await adminApi.listUsers();
      setUsers(list);
    } catch {
      // AppStateContext's poll-driven screens tolerate a failed fetch by
      // just keeping the last good data; do the same here rather than
      // showing an intrusive error for what's likely a transient blip.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const resetForm = () => {
    setName(''); setEmployeeId(''); setRole('staff'); setPassword(genPassword());
    setDepartment(''); setCardCode(''); setPhone('');
  };

  const closeForm = () => {
    setShowAdd(false);
    setEditingUser(null);
    resetForm();
  };

  // Android hardware/gesture back — the Add/Edit Staff form (below) is a
  // plain conditional full-screen replace, not a stack route, so React
  // Navigation has no idea it exists. Without this, back skipped straight
  // past it to the tab bar's own default behaviour.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showAdd) { closeForm(); return true; }
      return false;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAdd]);

  const openEdit = (u: AdminUser) => {
    setEditingUser(u);
    setName(u.name);
    setEmployeeId(u.employeeId);
    setRole(u.role);
    setDepartment(u.department ?? '');
    setCardCode(u.cardCode ?? '');
    setPhone(u.phone ?? '');
    setShowAdd(true);
  };

  const handleCreate = async () => {
    if (submitting) return;
    if (!name.trim() || !employeeId.trim() || !password.trim()) return;
    if (password.length < 8 || password.length > 64) {
      dialog.alert('Password must be 8–64 characters.', {title: 'Invalid password', tone: 'info'});
      return;
    }
    setSubmitting(true);
    try {
      const created = await adminApi.createUser({
        employeeId: employeeId.trim().toUpperCase(),
        name: name.trim(),
        role,
        password: password.trim(),
        department: department.trim() || undefined,
        cardCode: (role === 'doctor' || role === 'staff') && cardCode.trim() ? cardCode.trim() : undefined,
        phone: role === 'driver' && phone.trim() ? phone.trim() : undefined,
      });
      dialog.alert(`${name.trim()} can now sign in with:\n\nUsername: ${(created as any).username}\nPassword: ${password.trim()}\n\nShare these credentials securely — they won't be shown again here.`, {title: 'Staff Added', tone: 'info'});
      closeForm();
      loadUsers();
    } catch (err: any) {
      dialog.alert(err.message || 'Something went wrong', {title: 'Could not add staff', tone: 'info'});
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (submitting) return;
    if (!editingUser || !name.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.updateUser(editingUser.id, {
        name: name.trim(),
        role,
        department: department.trim(),
        cardCode: (role === 'doctor' || role === 'staff') ? cardCode.trim() : '',
        phone: role === 'driver' ? phone.trim() : '',
      });
      closeForm();
      loadUsers();
    } catch (err: any) {
      dialog.alert(err.message || 'Something went wrong', {title: 'Could not save changes', tone: 'info'});
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = () => {
    if (resettingPassword || !editingUser) return;
    const newPassword = genPassword();
    dialog.show({
      title: 'Reset Password?',
      message: `${editingUser.name}'s password will be changed to:\n\n${newPassword}\n\nShare this with them directly.`,
      tone: 'warning',
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          onPress: async () => {
            if (resettingPassword) return;
            setResettingPassword(true);
            try {
              await adminApi.resetPassword(editingUser.id, newPassword);
              dialog.alert(`New password: ${newPassword}`, {title: 'Password Reset', tone: 'info'});
            } catch (err: any) {
              dialog.alert(err.message || 'Something went wrong', {title: 'Could not reset password', tone: 'info'});
            } finally {
              setResettingPassword(false);
            }
          },
        },
      ],
    });
  };

  const handleDelete = () => {
    if (deletingAccount || !editingUser) return;
    dialog.show({
      title: 'Delete Account?',
      message: `This permanently removes ${editingUser.name}'s login (${editingUser.username}). This can't be undone.`,
      tone: 'warning',
      buttons: [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (deletingAccount) return;
            setDeletingAccount(true);
            try {
              await adminApi.deleteUser(editingUser.id);
              closeForm();
              loadUsers();
            } catch (err: any) {
              dialog.alert(err.message || 'Something went wrong', {title: 'Could not delete', tone: 'info'});
            } finally {
              setDeletingAccount(false);
            }
          },
        },
      ],
    });
  };

  const driverStaff = users.filter(u => u.role === 'driver');
  const filtered = filter === 'all' ? users : users.filter(u => u.role === filter);

  const onDuty  = driverStaff.filter(d => d.driverStatus === 'available').length;
  const onTask  = driverStaff.filter(d => d.driverStatus === 'busy').length;
  const offDuty = driverStaff.filter(d => d.driverStatus === 'off').length;

  const roleLabel = (r: Role) => ({doctor: 'Doctor', staff: 'Staff', valet: 'Valet', driver: 'Driver', admin: 'Admin'}[r]);

  const statusBadge = (u: AdminUser) => {
    if (u.role !== 'driver') return null;
    if (u.driverStatus === 'busy') return <Badge label="On Task"  variant="warning" dot />;
    if (u.driverStatus === 'available') return <Badge label="Ready" variant="success" dot />;
    return <Badge label="Off Duty" variant="muted" />;
  };

  // ── Add/Edit Staff form ──────────────────────────────────────────────────
  if (showAdd) {
    const isEdit = !!editingUser;
    // Mirrors the backend's LOGIN_PREFIX map — a live preview only; the
    // server generates and dedupes the real one on submit.
    const usernamePrefix: Record<Role, string> = {doctor: 'dr_', staff: '', valet: 'valet_', driver: 'driver_', admin: ''};
    const slug = (name.trim() || 'full name').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const previewUsername = `${usernamePrefix[role]}${slug || 'full_name'}`;
    return (
      <SafeAreaView edges={['bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.formHeader}>
          <PressableScale onPress={closeForm} style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.backTxt, {color: colors.textPrimary}]}>← Back</Text>
          </PressableScale>
          <Text style={[s.formTitle, {color: colors.textPrimary}]}>{isEdit ? 'Edit Staff' : 'Add Staff'}</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={[s.fieldLabel, {color: colors.textMuted}]}>ROLE {isEdit ? '(TRANSFER)' : ''}</Text>
          <View style={s.roleRow}>
            {ROLE_OPTIONS.map(r => (
              <PressableScale
                key={r.key}
                style={[s.roleChip, {borderColor: role === r.key ? colors.primary : colors.border, backgroundColor: role === r.key ? colors.primary + '15' : colors.surface}]}
                onPress={() => setRole(r.key)}
              >
                <Icon name={r.icon} size={18} color={role === r.key ? colors.primary : colors.textMuted} />
                <Text style={[s.roleChipTxt, {color: role === r.key ? colors.primary : colors.textSecondary}]}>{r.label}</Text>
              </PressableScale>
            ))}
          </View>

          <Text style={[s.fieldLabel, {color: colors.textMuted}]}>FULL NAME</Text>
          <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
            value={name} onChangeText={setName} placeholder="e.g. Kavita Reddy" placeholderTextColor={colors.textMuted}
            returnKeyType="next" blurOnSubmit={false}
            onSubmitEditing={() => focusFirst(empIdRef, deptRef, phoneRef)} />

          {isEdit && editingUser && (
            <View style={[s.usernameBanner, {backgroundColor: colors.primary + '10', borderColor: colors.primary + '30'}]}>
              <Text style={[s.usernameLbl, {color: colors.textMuted}]}>LOGS IN AS</Text>
              <Text style={[s.usernameVal, {color: colors.primary}]}>{editingUser.username}</Text>
            </View>
          )}
          {!isEdit && (
            <Text style={[s.helperNote, {color: colors.textMuted}]}>
              Their username is generated automatically — they'll sign in as "{previewUsername}".
            </Text>
          )}

          <Text style={[s.fieldLabel, {color: colors.textMuted}]}>EMPLOYEE ID{isEdit ? ' (FIXED)' : ''} — internal reference only</Text>
          <TextInput
            ref={r => { empIdRef.current = isEdit ? null : r; }}
            style={[s.input, {borderColor: colors.border, backgroundColor: isEdit ? colors.background : colors.surface, color: isEdit ? colors.textMuted : colors.textPrimary}]}
            value={employeeId} onChangeText={t => setEmployeeId(t.toUpperCase())} placeholder="e.g. DOC010" autoCapitalize="characters" placeholderTextColor={colors.textMuted}
            editable={!isEdit}
            returnKeyType="next" blurOnSubmit={false}
            onSubmitEditing={() => focusFirst(deptRef, phoneRef)}
          />

          {(role === 'doctor' || role === 'staff') && (
            <>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>DEPARTMENT (OPTIONAL)</Text>
              <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
                ref={deptRef}
                value={department} onChangeText={setDepartment} placeholder="e.g. Cardiology" placeholderTextColor={colors.textMuted}
                returnKeyType="next" blurOnSubmit={false}
                onSubmitEditing={() => focusFirst(cardCodeRef)} />

              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>VALET CARD CODE (OPTIONAL, 3 DIGITS)</Text>
              <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
                ref={cardCodeRef}
                value={cardCode} onChangeText={t => setCardCode(t.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 472" keyboardType="numeric" placeholderTextColor={colors.textMuted}
                returnKeyType="done" />
            </>
          )}

          {role === 'driver' && (
            <>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>PHONE (OPTIONAL)</Text>
              <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
                ref={phoneRef}
                value={phone} onChangeText={setPhone} placeholder="10-digit number" keyboardType="numeric" placeholderTextColor={colors.textMuted}
                returnKeyType="done" />
            </>
          )}

          {!isEdit && (
            <>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>PASSWORD</Text>
              <View style={[s.passwordRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <TextInput style={[s.passwordInput, {color: colors.textPrimary}]} value={password} onChangeText={setPassword} />
                <PressableScale onPress={() => setPassword(genPassword())} style={s.regenBtn}>
                  <Text style={[s.regenTxt, {color: colors.primary}]}>Regenerate</Text>
                </PressableScale>
              </View>
              <Text style={[s.passwordHint, {color: colors.textMuted}]}>
                {password.length > 0 && password.length < 8
                  ? '⚠ Password must be at least 8 characters.'
                  : "Share this with the new hire directly — it won't be shown again after creating the account."}
              </Text>
            </>
          )}

          <PressableScale
            style={[s.submitBtn, {backgroundColor: colors.primary, opacity: (name.trim() && employeeId.trim() && (isEdit || password.trim()) && !submitting) ? 1 : 0.4}]}
            onPress={isEdit ? handleSaveEdit : handleCreate}
            disabled={!name.trim() || !employeeId.trim() || (!isEdit && !password.trim()) || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnTxt}>{isEdit ? 'Save Changes' : 'Create Account'}</Text>}
          </PressableScale>

          {isEdit && (
            <>
              <PressableScale
                style={[s.secondaryBtn, {borderColor: colors.warning + '50', backgroundColor: colors.warning + '10', opacity: resettingPassword ? 0.6 : 1}]}
                onPress={handleResetPassword}
                disabled={resettingPassword || deletingAccount}>
                {resettingPassword
                  ? <ActivityIndicator color={colors.warning} />
                  : <Text style={[s.secondaryBtnTxt, {color: colors.warning}]}>Reset Password</Text>}
              </PressableScale>
              <PressableScale
                style={[s.secondaryBtn, {borderColor: colors.error + '50', backgroundColor: colors.error + '10', opacity: deletingAccount ? 0.6 : 1}]}
                onPress={handleDelete}
                disabled={resettingPassword || deletingAccount}>
                {deletingAccount
                  ? <ActivityIndicator color={colors.error} />
                  : <Text style={[s.secondaryBtnTxt, {color: colors.error}]}>Delete Account</Text>}
              </PressableScale>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Staff list ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView edges={['bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <PressableScale style={[s.addBtn, {backgroundColor: colors.primary}]} onPress={() => setShowAdd(true)}>
          <Icon name="plus" size={18} color="#fff" />
          <Text style={s.addBtnTxt}>Add Staff</Text>
        </PressableScale>

        {/* Driver summary — number stays neutral/bold (it's the content that
            matters); a small colored dot carries the status meaning, not
            the number itself, matching the Dashboard's stat-card language. */}
        <View style={s.statsRow}>
          {[
            {n: String(onDuty),  l: 'Drivers Ready', c: colors.success},
            {n: String(onTask),  l: 'On Task',        c: colors.warning},
            {n: String(offDuty), l: 'Off Duty',       c: colors.textMuted},
          ].map(st => (
            <View key={st.l} style={[s.statCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <Text style={[s.statNum, {color: colors.textPrimary}]}>{st.n}</Text>
              <View style={s.statLabelRow}>
                <View style={[s.statDot, {backgroundColor: st.c}]} />
                <Text style={[s.statLabel, {color: colors.textMuted}]}>{st.l}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTER_TABS.map(tab => (
            <PressableScale
              key={tab.key} onPress={() => setFilter(tab.key)}
              style={[s.filterChip, {backgroundColor: filter === tab.key ? colors.primary : colors.surface, borderColor: filter === tab.key ? colors.primary : colors.border}]}>
              <Text style={[s.filterLabel, {color: filter === tab.key ? '#fff' : colors.textSecondary}]}>{tab.label}</Text>
            </PressableScale>
          ))}
        </ScrollView>

        {/* Staff list */}
        {loading ? (
          <ActivityIndicator style={{marginTop: 20}} color={colors.primary} />
        ) : filtered.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No staff in this category yet</Text>
          </View>
        ) : (
          <View style={[s.listCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            {filtered.map((u, i) => (
              <PressableScale key={u.id} onPress={() => openEdit(u)}
                style={[s.staffRow, {borderBottomColor: colors.border}, i === filtered.length - 1 && {borderBottomWidth: 0}]}>
                <View style={[s.avatar, {backgroundColor: colors.primary + '15'}]}>
                  <Text style={[s.avatarText, {color: colors.primary}]}>
                    {u.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={[s.staffName, {color: colors.textPrimary}]}>{u.username}</Text>
                  <Text style={[s.staffRole, {color: colors.textSecondary}]}>
                    {roleLabel(u.role)} · ID {u.employeeId}
                  </Text>
                  {!!(u.department || u.phone) && (
                    <Text style={[s.staffLoc, {color: colors.textMuted}]}>{u.department || u.phone}</Text>
                  )}
                </View>
                <View style={s.staffRight}>
                  {statusBadge(u)}
                  <Icon name="arrowRight" size={14} color={colors.textMuted} />
                </View>
              </PressableScale>
            ))}
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  addBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 16, marginBottom: 16},
  addBtnTxt: {color: '#fff', fontSize: 14, fontWeight: '700'},
  statsRow: {flexDirection: 'row', gap: 10, marginBottom: 12},
  statCard: {flex: 1, alignItems: 'center', paddingVertical: 18, borderRadius: 24, borderWidth: 1},
  statNum: {fontSize: 24, fontWeight: '900'},
  statLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3},
  statDot: {width: 6, height: 6, borderRadius: 3},
  statLabel: {fontSize: 11, fontWeight: '600', textAlign: 'center'},
  filterRow: {paddingBottom: 14, gap: 8},
  filterChip: {paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5},
  filterLabel: {fontSize: 13, fontWeight: '700'},
  listCard: {borderRadius: 18, borderWidth: 1, overflow: 'hidden'},
  staffRow: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1},
  avatar: {width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  avatarText: {fontSize: 13, fontWeight: '900'},
  staffName: {fontSize: 13, fontWeight: '700'},
  staffRole: {fontSize: 11, marginTop: 2},
  staffLoc: {fontSize: 11, marginTop: 1},
  staffRight: {alignItems: 'flex-end', gap: 4},
  emptyBox: {borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 28, alignItems: 'center'},
  emptyTxt: {fontSize: 13, fontWeight: '600'},

  formHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingTop: 20},
  backBtn: {borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8},
  backTxt: {fontSize: 13, fontWeight: '700'},
  formTitle: {fontSize: 17, fontWeight: '900'},
  formScroll: {padding: 20, paddingBottom: 40},
  fieldLabel: {fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 16},
  usernameBanner: {borderRadius: 12, borderWidth: 1, padding: 12, marginTop: 14},
  usernameLbl: {fontSize: 9, fontWeight: '800', letterSpacing: 1},
  usernameVal: {fontSize: 15, fontWeight: '900', marginTop: 3},
  helperNote: {fontSize: 11, marginTop: 10, lineHeight: 16},
  input: {borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 15, fontWeight: '600'},
  roleRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  roleChip: {flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10},
  roleChipTxt: {fontSize: 12, fontWeight: '700'},
  passwordRow: {flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 14, height: 50},
  passwordInput: {flex: 1, fontSize: 15, fontWeight: '700'},
  regenBtn: {paddingLeft: 10},
  regenTxt: {fontSize: 12, fontWeight: '700'},
  passwordHint: {fontSize: 11, marginTop: 8, lineHeight: 16},
  submitBtn: {borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 28},
  submitBtnTxt: {color: '#fff', fontSize: 15, fontWeight: '800'},
  secondaryBtn: {borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: 1},
  secondaryBtnTxt: {fontSize: 14, fontWeight: '800'},
});
