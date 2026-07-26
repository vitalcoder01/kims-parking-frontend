import React from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Switch,
  TouchableOpacity,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {ThemeToggleRow, AppSwitch} from '../components/AppSwitch';
import {Card} from '../components/Card';
import {typography, spacing, radius} from '../theme';

type ThemeMode = 'light' | 'dark' | 'system';

export function SettingsScreen() {
  const {colors, isDark, mode, setMode} = useTheme();

  const [notifParking, setNotifParking] = React.useState(true);
  const [notifRetrieval, setNotifRetrieval] = React.useState(true);
  const [notifAttendance, setNotifAttendance] = React.useState(false);
  const [biometrics, setBiometrics] = React.useState(true);

  const modeOptions: {value: ThemeMode; label: string; icon: string}[] = [
    {value: 'light', label: 'Light', icon: '☀️'},
    {value: 'dark', label: 'Dark', icon: '🌙'},
    {value: 'system', label: 'System', icon: '📱'},
  ];

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile */}
        <Card style={styles.profileCard}>
          <View
            style={[styles.avatar, {backgroundColor: colors.primary + '22', borderColor: colors.primary + '44'}]}>
            <Text style={styles.avatarText}>PS</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, {color: colors.textPrimary}]}>
              Dr. Priya Sharma
            </Text>
            <Text style={[styles.profileRole, {color: colors.textSecondary}]}>
              Senior Cardiologist
            </Text>
            <Text style={[styles.profileId, {color: colors.primary}]}>
              KIMS-DOC-1042
            </Text>
          </View>
        </Card>

        {/* Theme Section */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>
          APPEARANCE
        </Text>

        {/* Quick toggle */}
        <ThemeToggleRow />

        {/* Mode selector */}
        <Card>
          <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>
            Theme Mode
          </Text>
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
                  <Text
                    style={[
                      styles.modeLabel,
                      {color: isActive ? colors.primary : colors.textSecondary},
                    ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>
          NOTIFICATIONS
        </Text>
        <Card>
          <AppSwitch
            label="Parking Updates"
            description="Vehicle parked, driver assigned"
            value={notifParking}
            onValueChange={setNotifParking}
          />
          <View style={[styles.divider, {backgroundColor: colors.divider}]} />
          <AppSwitch
            label="Retrieval Alerts"
            description="Driver en route, vehicle ready"
            value={notifRetrieval}
            onValueChange={setNotifRetrieval}
          />
          <View style={[styles.divider, {backgroundColor: colors.divider}]} />
          <AppSwitch
            label="Attendance Reminders"
            description="Check-in and check-out reminders"
            value={notifAttendance}
            onValueChange={setNotifAttendance}
          />
        </Card>

        {/* Security */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>
          SECURITY
        </Text>
        <Card>
          <AppSwitch
            label="Biometric Login"
            description="Use fingerprint or Face ID"
            value={biometrics}
            onValueChange={setBiometrics}
          />
        </Card>

        {/* App Info */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>
          ABOUT
        </Text>
        <Card>
          {[
            ['App Version', '1.0.0'],
            ['Build', 'Release'],
            ['Hospital', 'KIMS Hospitals'],
          ].map(([label, value]) => (
            <View
              key={label}
              style={[styles.infoRow, {borderBottomColor: colors.divider}]}>
              <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>
                {label}
              </Text>
              <Text style={[styles.infoValue, {color: colors.textPrimary}]}>
                {value}
              </Text>
            </View>
          ))}
        </Card>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: spacing.base, paddingBottom: spacing['3xl']},

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.black,
    color: '#FF6200',
  },
  profileInfo: {flex: 1},
  profileName: {fontSize: typography.sizes.md, fontWeight: typography.weights.black, letterSpacing: -0.3},
  profileRole: {fontSize: typography.sizes.sm, marginTop: 2},
  profileId: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, marginTop: 3},

  sectionTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },

  cardTitle: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },

  modeRow: {flexDirection: 'row', gap: spacing.sm},
  modeChip: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 4,
  },
  modeIcon: {fontSize: 20},
  modeLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.5},

  divider: {height: 1, marginVertical: spacing.xs},

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
  },
  infoLabel: {fontSize: typography.sizes.sm},
  infoValue: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},
});
