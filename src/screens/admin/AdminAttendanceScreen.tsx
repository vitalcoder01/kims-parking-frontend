import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Modal, Pressable, TextInput} from 'react-native';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../../context/ThemeContext';
import {Badge} from '../../components/Badge';
import {adminApi} from '../../services/api';
import {Icon, IconName} from '../../components/Icon';

interface TodayRow {
  id: number; userId: number; name: string; role: string; employeeId: string;
  checkIn: string | null; checkOut: string | null; vehiclesHandled: number; gate?: string | null;
}
interface MonthlyUser {
  userId: number; name: string; role: string; employeeId: string;
  days: {date: string; checkIn: string | null; checkOut: string | null; vehiclesHandled: number}[];
}

const roleLabel: Record<string, string> = {doctor: 'Doctor', staff: 'Staff', valet: 'Valet', driver: 'Driver', admin: 'Admin'};
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CATEGORIES: {key: string; label: string; icon: IconName}[] = [
  {key: 'all', label: 'All', icon: 'people'},
  {key: 'doctor', label: 'Doctors', icon: 'stethoscope'},
  {key: 'staff', label: 'Staff', icon: 'briefcase'},
  {key: 'valet', label: 'Valets', icon: 'key'},
  {key: 'driver', label: 'Drivers', icon: 'car'},
  {key: 'admin', label: 'Admins', icon: 'shield'},
];

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});
}

function monthLabel(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {month: 'long', year: 'numeric'});
}

function shiftMonth(monthStr: string, delta: number) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function UserCalendar({user, monthStr, colors}: {user: MonthlyUser; monthStr: string; colors: any}) {
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const presentDates = new Map(user.days.filter(d => d.checkIn).map(d => [d.date, d]));
  const todayStr = new Date().toISOString().slice(0, 10);
  const presentCount = presentDates.size;

  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)];

  return (
    <View style={[cs.card, {backgroundColor: colors.card, borderColor: colors.border}]}>
      <View style={cs.headRow}>
        <View style={{flex: 1}}>
          <Text style={[cs.name, {color: colors.textPrimary}]}>{user.name}</Text>
          <Text style={[cs.meta, {color: colors.textMuted}]}>{roleLabel[user.role] ?? user.role} · {user.employeeId}</Text>
        </View>
        <View style={[cs.countBox, {backgroundColor: colors.success + '15'}]}>
          <Text style={[cs.countNum, {color: colors.success}]}>{presentCount}</Text>
          <Text style={[cs.countLbl, {color: colors.textMuted}]}>days</Text>
        </View>
      </View>

      <View style={cs.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[cs.weekTxt, {color: colors.textMuted}]}>{w}</Text>
        ))}
      </View>
      <View style={cs.grid}>
        {cells.map((day, i) => {
          if (day == null) return <View key={i} style={cs.cell} />;
          const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const rec = presentDates.get(dateStr);
          const isToday = dateStr === todayStr;
          const isFuture = dateStr > todayStr;
          const bg = rec ? colors.success : isFuture ? 'transparent' : colors.cardAlt;
          const tc = rec ? '#fff' : isFuture ? colors.textMuted : colors.textSecondary;
          return (
            <View key={i} style={cs.cell}>
              <View style={[
                cs.dayDot,
                {backgroundColor: bg},
                isToday && {borderWidth: 1.5, borderColor: colors.primary},
              ]}>
                <Text style={[cs.dayTxt, {color: tc}]}>{day}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// A compact roster row, not a full stacked calendar per person — with
// dozens of staff, rendering everyone's full month grid one after another
// (the old behavior) turned this screen into an enormous scroll nobody
// could scan. Mobbin research (Remote Global HR's absences list, Fable's
// streak log) confirmed the standard pattern at this scale: a flat,
// scannable roster with each person's summary, drilling into their own
// calendar only on tap — see the modal below, reusing UserCalendar as-is.
function RosterRow({user, monthStr, colors, onPress, isLast}: {user: MonthlyUser; monthStr: string; colors: any; onPress: () => void; isLast: boolean}) {
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const presentDates = new Set(user.days.filter(d => d.checkIn).map(d => d.date));
  const presentCount = presentDates.size;
  const pct = daysInMonth ? Math.round((presentCount / daysInMonth) * 100) : 0;

  // Last 7 calendar days (not 7 working days) up to today, or the month's
  // end if viewing a past month — a quick "were they around recently"
  // glance, the same dot-per-day idiom Journal/Weverse use for a full
  // month, condensed to a week strip so it fits inline on a roster row.
  const todayStr = new Date().toISOString().slice(0, 10);
  const monthEndStr = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
  const anchor = monthEndStr < todayStr ? new Date(y, m - 1, daysInMonth) : new Date();
  const recentDays = Array.from({length: 7}, (_, i) => {
    const d = new Date(anchor);
    d.setDate(d.getDate() - (6 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {key, present: presentDates.has(key), inMonth: key.startsWith(monthStr)};
  });

  return (
    <PressableScale onPress={onPress} style={[rs.row, {borderBottomColor: colors.divider}, isLast && {borderBottomWidth: 0}]}>
      <View style={[rs.avatar, {backgroundColor: colors.primary + '15'}]}>
        <Text style={[rs.avatarTxt, {color: colors.primary}]}>{user.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</Text>
      </View>
      <View style={{flex: 1, minWidth: 0}}>
        <Text style={[rs.name, {color: colors.textPrimary}]} numberOfLines={1}>{user.name}</Text>
        <Text style={[rs.meta, {color: colors.textMuted}]}>{roleLabel[user.role] ?? user.role} · {user.employeeId}</Text>
        <View style={rs.dotStrip}>
          {recentDays.map(d => (
            <View key={d.key} style={[
              rs.miniDot,
              d.present
                ? {backgroundColor: colors.success}
                : {backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.border, opacity: d.inMonth ? 1 : 0.4},
            ]} />
          ))}
        </View>
      </View>
      <View style={{alignItems: 'flex-end'}}>
        <Text style={[rs.pct, {color: pct >= 80 ? colors.success : pct >= 50 ? colors.warning : colors.textMuted}]}>{pct}%</Text>
        <Text style={[rs.days, {color: colors.textMuted}]}>{presentCount}/{daysInMonth} days</Text>
      </View>
      <Icon name="chevronRight" size={16} color={colors.textMuted} />
    </PressableScale>
  );
}

export function AdminAttendanceScreen() {
  const {colors} = useTheme();
  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [monthUsers, setMonthUsers] = useState<MonthlyUser[]>([]);
  const [monthStr, setMonthStr] = useState(currentMonthStr());
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedUser, setSelectedUser] = useState<MonthlyUser | null>(null);

  const load = useCallback(async (month: string) => {
    try {
      const [today, allUsers, monthly] = await Promise.all([
        adminApi.attendanceToday(), adminApi.listUsers(), adminApi.attendanceMonthly(month),
      ]);
      setTodayRows(today);
      // Every staff account gets a calendar row — even with zero attendance
      // this month — so picking a category shows the whole roster, not just
      // whoever happened to already have a recorded day.
      const byUserId = new Map(monthly.users.map(u => [u.userId, u]));
      setMonthUsers(allUsers.map((u: any) => byUserId.get(u.id) ?? {
        userId: u.id, name: u.name, role: u.role, employeeId: u.employeeId, days: [],
      }));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { setLoading(true); load(monthStr); }, [monthStr, load]);

  const present = todayRows.filter(r => r.checkIn && !r.checkOut).length;
  const checkedInToday = todayRows.length;
  const totalStaff = monthUsers.length;
  const attendanceRate = totalStaff ? Math.round((checkedInToday / totalStaff) * 100) : 0;
  const isCurrentMonth = monthStr === currentMonthStr();
  const categoryCounts: Record<string, number> = {all: monthUsers.length};
  for (const u of monthUsers) categoryCounts[u.role] = (categoryCounts[u.role] ?? 0) + 1;
  const attQ = query.trim().toLowerCase();
  const filteredUsers = (category === 'all' ? monthUsers : monthUsers.filter(u => u.role === category))
    .filter(u => !attQ || u.name.toLowerCase().includes(attQ) || u.employeeId.toLowerCase().includes(attQ));
  const visibleCategories = CATEGORIES.filter(c => c.key === 'all' || categoryCounts[c.key] > 0);

  if (loading) {
    return (
      <SafeAreaView edges={['bottom','left','right']} style={[s.safe, s.centered, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom','left','right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(monthStr); }} tintColor={colors.primary} />}
      >
        {/* Two paired stats, not one number alone in a box — Mobbin
            reference: Open's streak hero (two big numbers side by side,
            small caption below each), Duolingo's bold streak treatment.
            Both numbers are real, derived data (nothing fabricated):
            present is today's still-clocked-in count, the rate is
            checked-in-today over the whole roster. */}
        <View style={[s.heroCard, {backgroundColor: colors.card, borderColor: colors.border}]}>
          <View style={s.heroRow}>
            <View style={s.heroStat}>
              <Text style={[s.heroNum, {color: colors.success}]}>{present}</Text>
              <Text style={[s.heroLbl, {color: colors.textMuted}]}>Present{'\n'}right now</Text>
            </View>
            <View style={[s.heroDivider, {backgroundColor: colors.divider}]} />
            <View style={s.heroStat}>
              <Text style={[s.heroNum, {color: colors.textPrimary}]}>{attendanceRate}%</Text>
              <Text style={[s.heroLbl, {color: colors.textMuted}]}>Checked in{'\n'}today</Text>
            </View>
          </View>
          <View style={[s.heroFootRow, {borderTopColor: colors.divider}]}>
            <Icon name="people" size={13} color={colors.textMuted} />
            <Text style={[s.heroFootTxt, {color: colors.textSecondary}]}>
              {checkedInToday} of {totalStaff} staff checked in today
            </Text>
          </View>
        </View>

        <View style={s.monthNav}>
          <PressableScale style={[s.monthBtn, {backgroundColor: colors.card, borderColor: colors.border}]} onPress={() => setMonthStr(m => shiftMonth(m, -1))}>
            <Text style={[s.monthBtnTxt, {color: colors.textPrimary}]}>‹</Text>
          </PressableScale>
          <Text style={[s.monthLabel, {color: colors.textPrimary}]}>{monthLabel(monthStr)}</Text>
          <PressableScale
            style={[s.monthBtn, {backgroundColor: colors.card, borderColor: colors.border, opacity: isCurrentMonth ? 0.35 : 1}]}
            onPress={() => !isCurrentMonth && setMonthStr(m => shiftMonth(m, 1))}
            disabled={isCurrentMonth}>
            <Text style={[s.monthBtnTxt, {color: colors.textPrimary}]}>›</Text>
          </PressableScale>
        </View>

        {/* Search — same box the Jobs/Records screen uses. Real gap this
            closes: with only role filter chips, finding one person in a
            roster of dozens meant scrolling and reading every row. */}
        <View style={[s.searchBox, {backgroundColor: colors.card, borderColor: colors.border}]}>
          <Icon name="search" size={17} color={colors.textMuted} />
          <TextInput
            style={[s.searchInput, {color: colors.textPrimary}]}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, employee ID"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {!!query && (
            <PressableScale onPress={() => setQuery('')}>
              <Icon name="close" size={15} color={colors.textMuted} />
            </PressableScale>
          )}
        </View>

        <Text style={[s.sec, {color: colors.textMuted}]}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catRow}>
          {visibleCategories.map(c => {
            const on = category === c.key;
            return (
              <PressableScale
                key={c.key}
                onPress={() => setCategory(c.key)}
                style={[
                  s.catChip,
                  {backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border},
                ]}>
                <Icon name={c.icon} size={14} color={on ? '#fff' : colors.textPrimary} />
                <Text style={[s.catLabel, {color: on ? '#fff' : colors.textPrimary}]}>{c.label}</Text>
                <View style={[s.catCount, {backgroundColor: on ? 'rgba(255,255,255,0.25)' : colors.cardAlt}]}>
                  <Text style={[s.catCountTxt, {color: on ? '#fff' : colors.textMuted}]}>{categoryCounts[c.key] ?? 0}</Text>
                </View>
              </PressableScale>
            );
          })}
        </ScrollView>

        <Text style={[s.sec, {color: colors.textMuted, marginTop: 4}]}>ROSTER — TAP FOR CALENDAR</Text>
        {filteredUsers.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>{attQ ? `No match for "${query.trim()}"` : 'No one in this category yet'}</Text>
          </View>
        ) : (
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border, marginBottom: 8}]}>
            {filteredUsers.map((u, i) => (
              <RosterRow key={u.userId} user={u} monthStr={monthStr} colors={colors} onPress={() => setSelectedUser(u)} isLast={i === filteredUsers.length - 1} />
            ))}
          </View>
        )}

        <Text style={[s.sec, {color: colors.textMuted, marginTop: 8}]}>TODAY — MARKED AUTOMATICALLY</Text>
        {todayRows.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>Nobody has been marked present yet today</Text>
          </View>
        ) : (
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {todayRows.map((r, i) => (
              <View key={r.id} style={[s.row, {borderBottomColor: colors.divider}, i === todayRows.length - 1 && {borderBottomWidth: 0}]}>
                <View style={{flex: 1}}>
                  <Text style={[s.name, {color: colors.textPrimary}]}>{r.name}</Text>
                  <Text style={[s.meta, {color: colors.textMuted}]}>
                    {roleLabel[r.role] ?? r.role} · {r.employeeId} · In {formatTime(r.checkIn)}
                  </Text>
                </View>
                {r.vehiclesHandled > 0 && <Text style={[s.vehicles, {color: colors.primary}]}>{r.vehiclesHandled} vehicles</Text>}
                <Badge label={r.checkOut ? 'Done' : 'Present'} variant={r.checkOut ? 'muted' : 'success'} dot={!r.checkOut} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* One person's full calendar, on demand — reuses UserCalendar as-is,
          just no longer stacked for every user at once. */}
      <Modal visible={!!selectedUser} transparent animationType="fade" onRequestClose={() => setSelectedUser(null)}>
        <Pressable style={s.modalOverlay} onPress={() => setSelectedUser(null)}>
          <Pressable style={s.modalBody} onPress={() => {}}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, {color: colors.textPrimary}]}>{monthLabel(monthStr)}</Text>
              <PressableScale style={[s.modalCloseBtn, {backgroundColor: colors.cardAlt}]} onPress={() => setSelectedUser(null)}>
                <Icon name="close" size={16} color={colors.textPrimary} />
              </PressableScale>
            </View>
            {selectedUser && <UserCalendar user={selectedUser} monthStr={monthStr} colors={colors} />}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  centered: {alignItems: 'center', justifyContent: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  heroCard: {borderRadius: 24, borderWidth: 1, marginBottom: 16, overflow: 'hidden'},
  heroRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 22},
  heroStat: {flex: 1, alignItems: 'center'},
  heroNum: {fontSize: 40, fontWeight: '900', letterSpacing: -1, lineHeight: 42},
  heroLbl: {fontSize: 11, fontWeight: '700', marginTop: 6, textAlign: 'center', lineHeight: 14},
  heroDivider: {width: 1, alignSelf: 'stretch', marginVertical: 8},
  heroFootRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderTopWidth: 1},
  heroFootTxt: {fontSize: 12, fontWeight: '600'},
  monthNav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14},
  monthBtn: {width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  monthBtnTxt: {fontSize: 18, fontWeight: '900'},
  monthLabel: {fontSize: 15, fontWeight: '800', minWidth: 140, textAlign: 'center'},
  sec: {fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8},
  searchBox: {flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, paddingHorizontal: 15, height: 48, marginBottom: 14},
  searchInput: {flex: 1, fontSize: 15, fontWeight: '500', padding: 0},
  catScroll: {marginHorizontal: -16, marginBottom: 14},
  catRow: {paddingHorizontal: 16, gap: 8},
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9,
  },
  catLabel: {fontSize: 12, fontWeight: '800'},
  catCount: {borderRadius: 10, paddingHorizontal: 6, paddingVertical: 1, minWidth: 18, alignItems: 'center'},
  catCountTxt: {fontSize: 10, fontWeight: '800'},
  sheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden'},
  emptyBox: {borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 24, alignItems: 'center', marginBottom: 8},
  emptyTxt: {fontSize: 13, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1},
  name: {fontSize: 13, fontWeight: '700'},
  meta: {fontSize: 11, marginTop: 2},
  vehicles: {fontSize: 11, fontWeight: '700'},

  modalOverlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24},
  modalBody: {width: '100%', maxWidth: 420},
  modalHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12},
  modalTitle: {fontSize: 17, fontWeight: '900'},
  modalCloseBtn: {width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center'},
});

const rs = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1},
  avatar: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  avatarTxt: {fontSize: 12, fontWeight: '900'},
  name: {fontSize: 13, fontWeight: '700'},
  meta: {fontSize: 11, marginTop: 2},
  dotStrip: {flexDirection: 'row', gap: 4, marginTop: 6},
  miniDot: {width: 7, height: 7, borderRadius: 3.5},
  pct: {fontSize: 15, fontWeight: '900'},
  days: {fontSize: 10, fontWeight: '600', marginTop: 1},
});

const cs = StyleSheet.create({
  card: {borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12},
  headRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 10},
  name: {fontSize: 14, fontWeight: '800'},
  meta: {fontSize: 11, marginTop: 2},
  countBox: {borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignItems: 'center'},
  countNum: {fontSize: 15, fontWeight: '900'},
  countLbl: {fontSize: 8, fontWeight: '700', textTransform: 'uppercase'},
  weekRow: {flexDirection: 'row', marginBottom: 4},
  weekTxt: {flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700'},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2},
  dayDot: {width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center'},
  dayTxt: {fontSize: 10, fontWeight: '700'},
});
