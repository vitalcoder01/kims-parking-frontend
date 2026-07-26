import React, {useState} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, Alert} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {Card} from '../../components/Card';
import {Button} from '../../components/Button';
import {Badge} from '../../components/Badge';
import {typography, spacing} from '../../theme';

const history = [
  {date: 'Wed 16 Jul', checkIn: '8:00 AM', checkOut: '—',       tasks: 4, status: 'active'},
  {date: 'Tue 15 Jul', checkIn: '7:57 AM', checkOut: '4:05 PM', tasks: 18, status: 'done'},
  {date: 'Mon 14 Jul', checkIn: '8:04 AM', checkOut: '4:00 PM', tasks: 21, status: 'done'},
  {date: 'Fri 11 Jul', checkIn: '8:00 AM', checkOut: '4:02 PM', tasks: 16, status: 'done'},
];

export function DriverAttendanceScreen() {
  const {colors} = useTheme();
  const {user} = useAuth();
  const [checkedIn, setCheckedIn] = useState(true);

  const roleLabel = 'Driver';

  return (
    <SafeAreaView style={[styles.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Card variant="primary" style={styles.todayCard}>
          <Text style={[styles.todayLabel, {color: colors.primary + 'AA'}]}>TODAY</Text>
          <Text style={[styles.todayDate, {color: colors.textPrimary}]}>
            Wednesday, 16 July 2026
          </Text>
          <View style={styles.timeRow}>
            <View>
              <Text style={[styles.timeLabel, {color: colors.textSecondary}]}>Shift Start</Text>
              <Text style={[styles.timeValue, {color: colors.textPrimary}]}>8:00 AM</Text>
            </View>
            <View style={[styles.tdivider, {backgroundColor: colors.border}]} />
            <View>
              <Text style={[styles.timeLabel, {color: colors.textSecondary}]}>Shift End</Text>
              <Text style={[styles.timeValue, {color: checkedIn ? colors.textMuted : colors.textPrimary}]}>
                {checkedIn ? '4:00 PM' : '4:05 PM'}
              </Text>
            </View>
            <Badge label={checkedIn ? 'On Duty' : 'Done'} variant={checkedIn ? 'success' : 'muted'} dot />
          </View>
          <Button
            label={checkedIn ? 'End Shift' : 'Shift Ended ✓'}
            variant={checkedIn ? 'primary' : 'ghost'}
            size="md"
            style={{marginTop: spacing.md}}
            disabled={!checkedIn}
            onPress={() =>
              Alert.alert('End Shift', 'Confirm shift end?', [
                {text: 'Cancel', style: 'cancel'},
                {text: 'Confirm', onPress: () => setCheckedIn(false)},
              ])
            }
          />
        </Card>

        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>JULY 2026</Text>
        <View style={styles.statsRow}>
          {[
            {num: '14', label: 'Days Present'},
            {num: '263', label: 'Tasks Done'},
            {num: '0', label: 'Absences'},
          ].map(s => (
            <Card key={s.label} style={styles.statCard}>
              <Text style={[styles.statNum, {color: colors.textPrimary}]}>{s.num}</Text>
              <Text style={[styles.statLabel, {color: colors.textMuted}]}>{s.label}</Text>
            </Card>
          ))}
        </View>

        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>RECENT HISTORY</Text>
        <Card>
          {history.map((row, i) => (
            <View
              key={row.date}
              style={[
                styles.histRow,
                {borderBottomColor: colors.divider},
                i === history.length - 1 && {borderBottomWidth: 0},
              ]}>
              <View style={{flex: 1}}>
                <Text style={[styles.histDate, {color: colors.textPrimary}]}>{row.date}</Text>
                <Text style={[styles.histSub, {color: colors.textMuted}]}>
                  {row.checkIn} → {row.checkOut}
                </Text>
              </View>
              <Text style={[styles.taskCount, {color: colors.primary}]}>
                {row.tasks} tasks
              </Text>
              <Badge
                label={row.status === 'active' ? 'Live' : 'Done'}
                variant={row.status === 'active' ? 'success' : 'muted'}
                dot={row.status === 'active'}
              />
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
  todayCard: {gap: 6},
  todayLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, letterSpacing: 1.5, textTransform: 'uppercase'},
  todayDate: {fontSize: typography.sizes.md, fontWeight: typography.weights.bold},
  timeRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm},
  timeLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.medium},
  timeValue: {fontSize: typography.sizes.xl, fontWeight: typography.weights.black, marginTop: 3},
  tdivider: {width: 1, height: 36},
  sectionTitle: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.md,
  },
  statsRow: {flexDirection: 'row', gap: spacing.sm},
  statCard: {flex: 1, alignItems: 'center', paddingVertical: spacing.md},
  statNum: {fontSize: typography.sizes['2xl'], fontWeight: typography.weights.black},
  statLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.medium, textAlign: 'center', marginTop: 3},
  histRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1},
  histDate: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},
  histSub: {fontSize: typography.sizes.xs, marginTop: 2},
  taskCount: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, marginRight: spacing.xs},
});
