import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {ThemeToggleRow, AppSwitch} from '../../components/AppSwitch';
import {Card} from '../../components/Card';
import {typography, spacing, radius} from '../../theme';
import {usersApi} from '../../services/api';

type ThemeMode = 'light' | 'dark' | 'system';

const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor', valet: 'Valet',
  parking_driver: 'Parking Driver', retrieval_driver: 'Retrieval Driver', admin: 'Admin',
};

export function SharedSettingsScreen() {
  const {colors, mode, setMode} = useTheme();
  const {user, logout, updateProfile} = useAuth();

  const [notifTasks,    setNotifTasks]    = React.useState(true);
  const [notifShift,    setNotifShift]    = React.useState(true);
  const [notifUpdates,  setNotifUpdates]  = React.useState(false);
  const [biometrics,    setBiometrics]    = React.useState(true);

  const showVehicleField = user?.role === 'doctor' || user?.role === 'staff';
  const [carNumber, setCarNumber] = React.useState(user?.carNumber ?? '');
  const [savingCar, setSavingCar] = React.useState(false);

  const handleSaveCarNumber = async () => {
    setSavingCar(true);
    try {
      const updated = await usersApi.updateMe({carNumber: carNumber.trim()});
      updateProfile({carNumber: updated.carNumber});
      Alert.alert('Saved', 'Your car number is on file — the valet won’t need to ask for it again.');
    } catch (err: any) {
      Alert.alert('Could not save', err.message || 'Something went wrong');
    } finally {
      setSavingCar(false);
    }
  };

  const modeOptions: {value: ThemeMode; label: string; icon: string}[] = [
    {value: 'light', label: 'Light', icon: '☀️'},
    {value: 'dark',  label: 'Dark',  icon: '🌙'},
    {value: 'system',label: 'System',icon: '📱'},
  ];

  const initials = user?.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2) ?? '??';

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]}>
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

        {/* Vehicle — doctor/staff only, reused by the valet at key handover */}
        {showVehicleField && (
          <>
            <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>VEHICLE</Text>
            <Card>
              <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Car Number Plate</Text>
              <View style={styles.carRow}>
                <TextInput
                  style={[styles.carInput, {borderColor: colors.border, backgroundColor: colors.cardAlt, color: colors.textPrimary}]}
                  value={carNumber}
                  onChangeText={t => setCarNumber(t.toUpperCase())}
                  placeholder="e.g. TN09 AB 1234"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                />
                <TouchableOpacity
                  style={[styles.carSaveBtn, {backgroundColor: colors.primary, opacity: savingCar ? 0.6 : 1}]}
                  onPress={handleSaveCarNumber} disabled={savingCar}
                >
                  <Text style={styles.carSaveTxt}>Save</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.carHint, {color: colors.textMuted}]}>
                Saved here once — the valet will see it automatically next time you hand over your key.
              </Text>
            </Card>
          </>
        )}

        {/* Appearance */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>APPEARANCE</Text>
        <ThemeToggleRow />
        <Card>
          <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Theme Mode</Text>
          <View style={styles.modeRow}>
            {modeOptions.map(opt => {
              const isActive = mode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  activeOpacity={0.7}
                  onPress={() => setMode(opt.value)}
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: isActive ? colors.primaryLight : colors.cardAlt,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}>
                  <Text style={styles.modeIcon}>{opt.icon}</Text>
                  <Text style={[styles.modeLabel, {color: isActive ? colors.primary : colors.textSecondary}]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

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
            ['App Version', '1.1'],
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
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() =>
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              {text: 'Cancel', style: 'cancel'},
              {text: 'Logout', style: 'destructive', onPress: logout},
            ])
          }
          style={[styles.logoutBtn, {backgroundColor: colors.errorLight, borderColor: colors.error + '44'}]}>
          <Text style={[styles.logoutText, {color: colors.error}]}>Logout</Text>
        </TouchableOpacity>

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
  modeIcon: {fontSize: 20},
  modeLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.5},

  carRow: {flexDirection: 'row', gap: spacing.sm},
  carInput: {flex: 1, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing.sm, height: 46, fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},
  carSaveBtn: {borderRadius: radius.md, paddingHorizontal: spacing.md, height: 46, alignItems: 'center', justifyContent: 'center'},
  carSaveTxt: {color: '#fff', fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},
  carHint: {fontSize: typography.sizes.xs, marginTop: spacing.sm, lineHeight: 16},

  divider: {height: 1, marginVertical: spacing.xs},

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
