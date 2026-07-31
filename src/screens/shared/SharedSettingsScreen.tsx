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

type ThemeMode = 'light' | 'dark' | 'system';

const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor', valet: 'Valet',
  parking_driver: 'Parking Driver', retrieval_driver: 'Retrieval Driver', admin: 'Admin',
};

export function SharedSettingsScreen() {
  const dialog = useDialog();
  const {colors, mode, setMode} = useTheme();
  const {user, logout} = useAuth();

  // Admin-only: driver accept window (seconds) — how long a driver has to
  // accept an assignment before the valet is prompted to reassign.
  const [acceptTimeout, setAcceptTimeout] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (user?.role !== 'admin') return;
    adminApi.getSettings()
      .then(s => setAcceptTimeout(Number(s.driverAcceptTimeoutSeconds) || 60))
      .catch(() => {});
  }, [user?.role]);

  const changeAcceptTimeout = (delta: number) => {
    setAcceptTimeout(prev => {
      const next = Math.min(600, Math.max(10, (prev ?? 60) + delta));
      adminApi.updateSettings({driverAcceptTimeoutSeconds: next}).catch(() => {});
      return next;
    });
  };

  const [notifTasks,    setNotifTasks]    = React.useState(true);
  const [notifShift,    setNotifShift]    = React.useState(true);
  const [notifUpdates,  setNotifUpdates]  = React.useState(false);
  const [biometrics,    setBiometrics]    = React.useState(true);

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
        {user?.role === 'admin' && acceptTimeout != null && (
          <>
            <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>OPERATIONS</Text>
            <Card>
              <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Driver Accept Timeout</Text>
              <View style={styles.stepperRow}>
                <PressableScale
                  onPress={() => changeAcceptTimeout(-10)}
                  style={[styles.stepperBtn, {backgroundColor: colors.cardAlt, borderColor: colors.border}]}>
                  <Text style={[styles.stepperBtnTxt, {color: colors.textPrimary}]}>−10s</Text>
                </PressableScale>
                <Text style={[styles.stepperValue, {color: colors.textPrimary}]}>{acceptTimeout}s</Text>
                <PressableScale
                  onPress={() => changeAcceptTimeout(10)}
                  style={[styles.stepperBtn, {backgroundColor: colors.cardAlt, borderColor: colors.border}]}>
                  <Text style={[styles.stepperBtnTxt, {color: colors.textPrimary}]}>+10s</Text>
                </PressableScale>
              </View>
              <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>
                If a driver doesn't accept a job within this window, the valet is alerted and asked to reassign.
              </Text>
            </Card>
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
});
