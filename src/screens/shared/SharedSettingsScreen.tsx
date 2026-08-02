import React from 'react';
import {ScrollView, View, Text, StyleSheet} from 'react-native';
import {useDialog} from '../../components/AppDialog';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {ThemeToggleRow, AppSwitch} from '../../components/AppSwitch';
import {Card} from '../../components/Card';
import {Icon, IconName} from '../../components/Icon';
import {typography, spacing, radius} from '../../theme';
import {APP_VERSION_NAME, APP_VERSION_CODE} from '../../config/version';
import {adminApi} from '../../services/api';
import {EditProfileSheet, EditProfileMode} from '../../components/EditProfileSheet';

type ThemeMode = 'light' | 'dark' | 'system';

const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor', valet: 'Valet',
  parking_driver: 'Parking Driver', retrieval_driver: 'Retrieval Driver', admin: 'Admin',
};

export function SharedSettingsScreen() {
  const dialog = useDialog();
  const {colors, mode, setMode} = useTheme();
  const {user, logout} = useAuth();

  // Admin-only operational knobs. Loaded together because they come from one
  // endpoint, and held as one object so a stepper cannot write a stale
  // sibling value back over someone else's change.
  const [ops, setOps] = React.useState<{
    driverAcceptTimeoutSeconds: number;
    ownerResponseTimeoutSeconds: number;
    retrievalLeadTimeMinutes: number;
  } | null>(null);

  React.useEffect(() => {
    if (user?.role !== 'admin') return;
    adminApi.getSettings()
      .then(s => setOps({
        // Number('') is 0, so `|| default` is right here: an absent or blank
        // row means "never set", not "set to zero".
        driverAcceptTimeoutSeconds: Number(s.driverAcceptTimeoutSeconds) || 60,
        ownerResponseTimeoutSeconds: Number(s.ownerResponseTimeoutSeconds) || 60,
        // Lead time is the exception — 0 IS a real choice ("start the moment
        // they ask"), so it must survive rather than snap back to 10.
        retrievalLeadTimeMinutes: Number.isFinite(Number(s.retrievalLeadTimeMinutes))
          ? Number(s.retrievalLeadTimeMinutes) : 10,
      }))
      .catch(() => {});
  }, [user?.role]);

  // Clamped to the same ranges the backend validates, so a tap can never
  // produce a request the server will reject.
  const OPS_RANGE = {
    driverAcceptTimeoutSeconds: [10, 600],
    ownerResponseTimeoutSeconds: [10, 600],
    retrievalLeadTimeMinutes: [0, 240],
  } as const;

  const bumpOps = (key: keyof typeof OPS_RANGE, delta: number) => {
    setOps(prev => {
      if (!prev) return prev;
      const [lo, hi] = OPS_RANGE[key];
      const next = Math.min(hi, Math.max(lo, prev[key] + delta));
      if (next === prev[key]) return prev;   // already at the limit — no write
      adminApi.updateSettings({[key]: next}).catch(() => {});
      return {...prev, [key]: next};
    });
  };

  const [notifTasks,    setNotifTasks]    = React.useState(true);
  const [notifShift,    setNotifShift]    = React.useState(true);
  const [notifUpdates,  setNotifUpdates]  = React.useState(false);
  const [biometrics,    setBiometrics]    = React.useState(true);

  // Which self-service edit sheet is open, if any. One state variable so
  // opening a second field cleanly replaces the first instead of stacking.
  const [editMode, setEditMode] = React.useState<EditProfileMode | null>(null);

  const modeOptions: {value: ThemeMode; label: string; icon: IconName}[] = [
    {value: 'light', label: 'Light', icon: 'sun'},
    {value: 'dark',  label: 'Dark',  icon: 'moon'},
    {value: 'system',label: 'System',icon: 'phone'},
  ];

  const initials = user?.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2) ?? '??';

  return (
    <SafeAreaView edges={['bottom','left','right']} style={[styles.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile */}
        <Card style={styles.profileCard}>
          <View style={[styles.avatar, {backgroundColor: colors.primary + '22', borderColor: colors.primary + '44'}]}>
            <Text style={[styles.avatarText, {color: colors.primary}]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, {color: colors.textPrimary}]}>{user?.name ?? '—'}</Text>
            <Text style={[styles.profileRole, {color: colors.textSecondary}]}>
              {user ? ROLE_LABELS[user.role] : '—'}
              {user?.department ? ` · ${user.department}` : ''}
            </Text>
            <Text style={[styles.profileId, {color: colors.primary}]}>{user?.employeeId ?? '—'}</Text>
          </View>
        </Card>

        {/* Account — self-service edits for name, login username, and
            password. Each row opens its own bottom sheet so a mistap on
            one field cannot accidentally rewrite another. */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>ACCOUNT</Text>
        <Card style={{padding: 0, overflow: 'hidden'}}>
          {([
            {mode: 'name' as const,     label: 'Display name', value: user?.name ?? '—',     icon: 'user' as IconName},
            {mode: 'username' as const, label: 'Login username', value: user?.username ?? '—', icon: 'userCard' as IconName},
            {mode: 'password' as const, label: 'Password',      value: '••••••••',           icon: 'lock' as IconName},
          ]).map((row, i, arr) => (
            <PressableScale
              key={row.mode}
              onPress={() => setEditMode(row.mode)}
              style={[
                styles.accountRow,
                i < arr.length - 1 && {borderBottomColor: colors.divider, borderBottomWidth: 1},
              ]}>
              <View style={[styles.accountIconWrap, {backgroundColor: colors.cardAlt}]}>
                <Icon name={row.icon} size={16} color={colors.textPrimary} />
              </View>
              <View style={{flex: 1}}>
                <Text style={[styles.accountRowLabel, {color: colors.textMuted}]}>{row.label}</Text>
                <Text style={[styles.accountRowValue, {color: colors.textPrimary}]} numberOfLines={1}>{row.value}</Text>
              </View>
              <Icon name="chevronRight" size={16} color={colors.textMuted} />
            </PressableScale>
          ))}
        </Card>

        {/* Appearance */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>APPEARANCE</Text>
        <ThemeToggleRow />
        <Card>
          <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Theme Mode</Text>
          <View style={styles.modeRow}>
            {modeOptions.map(opt => {
              const isActive = mode === opt.value;
              return (
                <PressableScale
                  key={opt.value}
                  onPress={() => setMode(opt.value)}
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: isActive ? colors.primaryLight : colors.cardAlt,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}>
                  <Icon name={opt.icon} size={20} color={isActive ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.modeLabel, {color: isActive ? colors.primary : colors.textSecondary}]}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Card>

        {/* Operations (admin only) */}
        {user?.role === 'admin' && ops != null && (
          <>
            <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>OPERATIONS</Text>
            {([
              {
                key: 'retrievalLeadTimeMinutes' as const,
                title: 'Retrieval Lead Time',
                step: 5,
                unit: 'min',
                help: 'How far ahead of a doctor\'s planned departure the owning valet is automatically alerted. A request shows on the Retrieval Requests page as "Scheduled" until then — a valet can still assign a driver early if they check it themselves; this only controls when the alert fires on its own. Set it to cover walking to the slot and driving back.',
              },
              {
                key: 'ownerResponseTimeoutSeconds' as const,
                title: 'Owner Response Timeout',
                step: 10,
                unit: 's',
                help: 'How long the owning valet has to respond once alerted. If they do not, the request is released to every available valet.',
              },
              {
                key: 'driverAcceptTimeoutSeconds' as const,
                title: 'Driver Accept Timeout',
                step: 10,
                unit: 's',
                help: "If a driver doesn't accept a job within this window, the valet is alerted and asked to reassign.",
              },
            ]).map(row => {
              const [lo, hi] = OPS_RANGE[row.key];
              const value = ops[row.key];
              return (
                <Card key={row.key}>
                  <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>{row.title}</Text>
                  <View style={styles.stepperRow}>
                    <PressableScale
                      onPress={() => bumpOps(row.key, -row.step)}
                      disabled={value <= lo}
                      style={[styles.stepperBtn, {backgroundColor: colors.cardAlt, borderColor: colors.border}, value <= lo && {opacity: 0.4}]}>
                      <Text style={[styles.stepperBtnTxt, {color: colors.textPrimary}]}>−{row.step}{row.unit}</Text>
                    </PressableScale>
                    <Text style={[styles.stepperValue, {color: colors.textPrimary}]}>{value}{row.unit}</Text>
                    <PressableScale
                      onPress={() => bumpOps(row.key, row.step)}
                      disabled={value >= hi}
                      style={[styles.stepperBtn, {backgroundColor: colors.cardAlt, borderColor: colors.border}, value >= hi && {opacity: 0.4}]}>
                      <Text style={[styles.stepperBtnTxt, {color: colors.textPrimary}]}>+{row.step}{row.unit}</Text>
                    </PressableScale>
                  </View>
                  <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{row.help}</Text>
                </Card>
              );
            })}
          </>
        )}

        {/* Notifications */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>NOTIFICATIONS</Text>
        <Card>
          <AppSwitch
            label="Task Assignments"
            description="When a new task is assigned to you"
            value={notifTasks}
            onValueChange={setNotifTasks}
          />
          <View style={[styles.divider, {backgroundColor: colors.divider}]} />
          <AppSwitch
            label="Shift Reminders"
            description="Start and end of shift alerts"
            value={notifShift}
            onValueChange={setNotifShift}
          />
          <View style={[styles.divider, {backgroundColor: colors.divider}]} />
          <AppSwitch
            label="App Updates"
            description="New features and announcements"
            value={notifUpdates}
            onValueChange={setNotifUpdates}
          />
        </Card>

        {/* Security */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>SECURITY</Text>
        <Card>
          <AppSwitch
            label="Biometric Login"
            description="Use fingerprint or Face ID"
            value={biometrics}
            onValueChange={setBiometrics}
          />
        </Card>

        {/* About */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>ABOUT</Text>
        <Card>
          {[
            ['App Version', `${APP_VERSION_NAME} (${APP_VERSION_CODE})`],
            ['Build', 'Release'],
            ['Hospital', 'KIMS Hospitals'],
          ].map(([label, value]) => (
            <View
              key={label}
              style={[styles.infoRow, {borderBottomColor: colors.divider}]}>
              <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{label}</Text>
              <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{value}</Text>
            </View>
          ))}
        </Card>

        {/* Logout */}
        <PressableScale
          onPress={() =>
            dialog.show({title: 'Logout', message: 'Are you sure you want to logout?', tone: 'warning', buttons: [
              {text: 'Cancel', style: 'cancel'},
              {text: 'Logout', style: 'destructive', onPress: logout},
            ]})
          }
          style={[styles.logoutBtn, {backgroundColor: colors.errorLight, borderColor: colors.error + '44'}]}>
          <Text style={[styles.logoutText, {color: colors.error}]}>Logout</Text>
        </PressableScale>

      </ScrollView>

      <EditProfileSheet
        visible={editMode !== null}
        mode={editMode}
        onClose={() => setEditMode(null)}
        onSuccess={(msg) => dialog.alert(msg, {tone: 'success', title: 'Saved'})}
        onError={(msg) => dialog.alert(msg, {tone: 'error', title: "Couldn't save"})}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: spacing.base, paddingBottom: spacing['3xl']},

  profileCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md},
  avatar: {width: 54, height: 54, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  avatarText: {fontSize: typography.sizes.lg, fontWeight: typography.weights.black},
  profileInfo: {flex: 1},
  profileName: {fontSize: typography.sizes.md, fontWeight: typography.weights.black, letterSpacing: -0.3},
  profileRole: {fontSize: typography.sizes.sm, marginTop: 2},
  profileId: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, marginTop: 3},

  sectionTitle: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.md,
  },

  cardTitle: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm,
  },
  modeRow: {flexDirection: 'row', gap: spacing.sm},
  modeChip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1.5, alignItems: 'center', gap: 4,
  },
  modeLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.5},


  divider: {height: 1, marginVertical: spacing.xs},

  stepperRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm},
  stepperBtn: {borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: spacing.base, paddingVertical: spacing.sm},
  stepperBtnTxt: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},
  stepperValue: {fontSize: typography.sizes.lg, fontWeight: typography.weights.black},

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1,
  },
  infoLabel: {fontSize: typography.sizes.sm},
  infoValue: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},

  logoutBtn: {
    borderRadius: radius.lg, borderWidth: 1,
    paddingVertical: spacing.base, alignItems: 'center', marginTop: spacing.sm,
  },
  logoutText: {fontSize: typography.sizes.base, fontWeight: typography.weights.black},

  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.base, paddingVertical: 14,
  },
  accountIconWrap: {width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center'},
  accountRowLabel: {fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase'},
  accountRowValue: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold, marginTop: 2},
});
