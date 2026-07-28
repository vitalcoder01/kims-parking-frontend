import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator} from 'react-native';
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
    if (!name.trim() || !employeeId.trim() || !password.trim()) return;
    if (password.length < 8 || password.length > 64) {
      Alert.alert('Invalid password', 'Password must be 8–64 characters.');
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
      Alert.alert(
        'Staff Added',
        `${name.trim()} can now sign in with:\n\nUsername: ${(created as any).username}\nPassword: ${password.trim()}\n\nShare these credentials securely — they won't be shown again here.`,
      );
      closeForm();
      loadUsers();
    } catch (err: any) {
      Alert.alert('Could not add staff', err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async () => {
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
      Alert.alert('Could not save changes', err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = () => {
    if (!editingUser) return;
    const newPassword = genPassword();
    Alert.alert(
      'Reset Password?',
      `${editingUser.name}'s password will be changed to:\n\n${newPassword}\n\nShare this with them directly.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Reset',
          onPress: async () => {
            try {
              await adminApi.resetPassword(editingUser.id, newPassword);
              Alert.alert('Password Reset', `New password: ${newPassword}`);
            } catch (err: any) {
              Alert.alert('Could not reset password', err.message || 'Something went wrong');
            }
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    if (!editingUser) return;
    Alert.alert(
      'Delete Account?',
      `This permanently removes ${editingUser.name}'s login (${editingUser.username}). This can't be undone.`,
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await adminApi.deleteUser(editingUser.id);
              closeForm();
              loadUsers();
            } catch (err: any) {
              Alert.alert('Could not delete', err.message || 'Something went wrong');
            }
          },
        },
      ],
    );
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
      <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
        <View style={s.formHeader}>
          <TouchableOpacity onPress={closeForm} style={[s.backBtn, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <Text style={[s.backTxt, {color: colors.textPrimary}]}>← Back</Text>
          </TouchableOpacity>
          <Text style={[s.formTitle, {color: colors.textPrimary}]}>{isEdit ? 'Edit Staff' : 'Add Staff'}</Text>
          <View style={{width: 70}} />
        </View>
        <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
          <Text style={[s.fieldLabel, {color: colors.textMuted}]}>ROLE {isEdit ? '(TRANSFER)' : ''}</Text>
          <View style={s.roleRow}>
            {ROLE_OPTIONS.map(r => (
              <TouchableOpacity
                key={r.key}
                style={[s.roleChip, {borderColor: role === r.key ? colors.primary : colors.border, backgroundColor: role === r.key ? colors.primary + '15' : colors.surface}]}
                onPress={() => setRole(r.key)} activeOpacity={0.7}
              >
                <Icon name={r.icon} size={18} color={role === r.key ? colors.primary : colors.textMuted} />
                <Text style={[s.roleChipTxt, {color: role === r.key ? colors.primary : colors.textSecondary}]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[s.fieldLabel, {color: colors.textMuted}]}>FULL NAME</Text>
          <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
            value={name} onChangeText={setName} placeholder="e.g. Kavita Reddy" placeholderTextColor={colors.textMuted} />

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
            style={[s.input, {borderColor: colors.border, backgroundColor: isEdit ? colors.background : colors.surface, color: isEdit ? colors.textMuted : colors.textPrimary}]}
            value={employeeId} onChangeText={t => setEmployeeId(t.toUpperCase())} placeholder="e.g. DOC010" autoCapitalize="characters" placeholderTextColor={colors.textMuted}
            editable={!isEdit}
          />

          {(role === 'doctor' || role === 'staff') && (
            <>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>DEPARTMENT (OPTIONAL)</Text>
              <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
                value={department} onChangeText={setDepartment} placeholder="e.g. Cardiology" placeholderTextColor={colors.textMuted} />

              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>VALET CARD CODE (OPTIONAL, 3 DIGITS)</Text>
              <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
                value={cardCode} onChangeText={t => setCardCode(t.replace(/\D/g, '').slice(0, 3))} placeholder="e.g. 472" keyboardType="numeric" placeholderTextColor={colors.textMuted} />
            </>
          )}

          {role === 'driver' && (
            <>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>PHONE (OPTIONAL)</Text>
              <TextInput style={[s.input, {borderColor: colors.border, backgroundColor: colors.surface, color: colors.textPrimary}]}
                value={phone} onChangeText={setPhone} placeholder="10-digit number" keyboardType="numeric" placeholderTextColor={colors.textMuted} />
            </>
          )}

          {!isEdit && (
            <>
              <Text style={[s.fieldLabel, {color: colors.textMuted}]}>PASSWORD</Text>
              <View style={[s.passwordRow, {borderColor: colors.border, backgroundColor: colors.surface}]}>
                <TextInput style={[s.passwordInput, {color: colors.textPrimary}]} value={password} onChangeText={setPassword} />
                <TouchableOpacity onPress={() => setPassword(genPassword())} style={s.regenBtn}>
                  <Text style={[s.regenTxt, {color: colors.primary}]}>Regenerate</Text>
                </TouchableOpacity>
              </View>
              <Text style={[s.passwordHint, {color: colors.textMuted}]}>
                {password.length > 0 && password.length < 8
                  ? '⚠ Password must be at least 8 characters.'
                  : "Share this with the new hire directly — it won't be shown again after creating the account."}
              </Text>
            </>
          )}

          <TouchableOpacity
            style={[s.submitBtn, {backgroundColor: colors.primary, opacity: (name.trim() && employeeId.trim() && (isEdit || password.trim()) && !submitting) ? 1 : 0.4}]}
            onPress={isEdit ? handleSaveEdit : handleCreate}
            disabled={!name.trim() || !employeeId.trim() || (!isEdit && !password.trim()) || submitting}
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitBtnTxt}>{isEdit ? 'Save Changes' : 'Create Account'}</Text>}
          </TouchableOpacity>

          {isEdit && (
            <>
              <TouchableOpacity style={[s.secondaryBtn, {borderColor: colors.warning + '50', backgroundColor: colors.warning + '10'}]} onPress={handleResetPassword}>
                <Text style={[s.secondaryBtnTxt, {color: colors.warning}]}>Reset Password</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.secondaryBtn, {borderColor: colors.error + '50', backgroundColor: colors.error + '10'}]} onPress={handleDelete}>
                <Text style={[s.secondaryBtnTxt, {color: colors.error}]}>Delete Account</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Staff list ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <TouchableOpacity style={[s.addBtn, {backgroundColor: colors.primary}]} onPress={() => setShowAdd(true)} activeOpacity={0.85}>
          <Icon name="user" size={18} color="#fff" />
          <Text style={s.addBtnTxt}>+ Add Staff</Text>
        </TouchableOpacity>

        {/* Driver summary */}
        <View style={s.statsRow}>
          {[
            {n: String(onDuty),  l: 'Drivers Ready', c: colors.success},
            {n: String(onTask),  l: 'On Task',        c: colors.warning},
            {n: String(offDuty), l: 'Off Duty',       c: colors.textMuted},
          ].map(st => (
            <View key={st.l} style={[s.statCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <Text style={[s.statNum, {color: st.c}]}>{st.n}</Text>
              <Text style={[s.statLabel, {color: colors.textMuted}]}>{st.l}</Text>
            </View>
          ))}
        </View>

        {/* Filter tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRow}>
          {FILTER_TABS.map(tab => (
            <TouchableOpacity
              key={tab.key} activeOpacity={0.7} onPress={() => setFilter(tab.key)}
              style={[s.filterChip, {backgroundColor: filter === tab.key ? colors.primary : colors.surface, borderColor: filter === tab.key ? colors.primary : colors.border}]}>
              <Text style={[s.filterLabel, {color: filter === tab.key ? '#fff' : colors.textSecondary}]}>{tab.label}</Text>
            </TouchableOpacity>
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
              <TouchableOpacity key={u.id} onPress={() => openEdit(u)} activeOpacity={0.7}
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
              </TouchableOpacity>
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
  addBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 14},
  addBtnTxt: {color: '#fff', fontSize: 14, fontWeight: '800'},
  statsRow: {flexDirection: 'row', gap: 10, marginBottom: 12},
  statCard: {flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1},
  statNum: {fontSize: 24, fontWeight: '900'},
  statLabel: {fontSize: 11, fontWeight: '600', marginTop: 2, textAlign: 'center'},
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
