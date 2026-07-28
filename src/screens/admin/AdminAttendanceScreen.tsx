import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {Badge} from '../../components/Badge';
import {adminApi} from '../../services/api';

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
const CATEGORIES: {key: string; label: string; icon: string}[] = [
  {key: 'all', label: 'All', icon: '👥'},
  {key: 'doctor', label: 'Doctors', icon: '🩺'},
  {key: 'staff', label: 'Staff', icon: '🧑‍💼'},
  {key: 'valet', label: 'Valets', icon: '🔑'},
  {key: 'driver', label: 'Drivers', icon: '🚗'},
  {key: 'admin', label: 'Admins', icon: '🛡️'},
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

export function AdminAttendanceScreen() {
  const {colors} = useTheme();
  const [todayRows, setTodayRows] = useState<TodayRow[]>([]);
  const [monthUsers, setMonthUsers] = useState<MonthlyUser[]>([]);
  const [monthStr, setMonthStr] = useState(currentMonthStr());
  const [category, setCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
  const isCurrentMonth = monthStr === currentMonthStr();
  const categoryCounts: Record<string, number> = {all: monthUsers.length};
  for (const u of monthUsers) categoryCounts[u.role] = (categoryCounts[u.role] ?? 0) + 1;
  const filteredUsers = category === 'all' ? monthUsers : monthUsers.filter(u => u.role === category);
  const visibleCategories = CATEGORIES.filter(c => c.key === 'all' || categoryCounts[c.key] > 0);

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, s.centered, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(monthStr); }} tintColor={colors.primary} />}
      >
        <View style={[s.summaryCard, {backgroundColor: colors.card, borderColor: colors.border}]}>
          <Text style={[s.summaryNum, {color: colors.success}]}>{present}</Text>
          <Text style={[s.summaryLbl, {color: colors.textMuted}]}>Present right now</Text>
        </View>

        <View style={s.monthNav}>
          <TouchableOpacity style={[s.monthBtn, {backgroundColor: colors.card, borderColor: colors.border}]} onPress={() => setMonthStr(m => shiftMonth(m, -1))}>
            <Text style={[s.monthBtnTxt, {color: colors.textPrimary}]}>‹</Text>
          </TouchableOpacity>
          <Text style={[s.monthLabel, {color: colors.textPrimary}]}>{monthLabel(monthStr)}</Text>
          <TouchableOpacity
            style={[s.monthBtn, {backgroundColor: colors.card, borderColor: colors.border, opacity: isCurrentMonth ? 0.35 : 1}]}
            onPress={() => !isCurrentMonth && setMonthStr(m => shiftMonth(m, 1))}
            disabled={isCurrentMonth}>
            <Text style={[s.monthBtnTxt, {color: colors.textPrimary}]}>›</Text>
          </TouchableOpacity>
        </View>

        <Text style={[s.sec, {color: colors.textMuted}]}>CATEGORY</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll} contentContainerStyle={s.catRow}>
          {visibleCategories.map(c => {
            const on = category === c.key;
            return (
              <TouchableOpacity
                key={c.key}
                activeOpacity={0.8}
                onPress={() => setCategory(c.key)}
                style={[
                  s.catChip,
                  {backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border},
                ]}>
                <Text style={s.catIcon}>{c.icon}</Text>
                <Text style={[s.catLabel, {color: on ? '#fff' : colors.textPrimary}]}>{c.label}</Text>
                <View style={[s.catCount, {backgroundColor: on ? 'rgba(255,255,255,0.25)' : colors.cardAlt}]}>
                  <Text style={[s.catCountTxt, {color: on ? '#fff' : colors.textMuted}]}>{categoryCounts[c.key] ?? 0}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={[s.sec, {color: colors.textMuted, marginTop: 4}]}>PER-USER CALENDAR</Text>
        {filteredUsers.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No one in this category yet</Text>
          </View>
        ) : filteredUsers.map(u => <UserCalendar key={u.userId} user={u} monthStr={monthStr} colors={colors} />)}

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  centered: {alignItems: 'center', justifyContent: 'center'},
  scroll: {padding: 16, paddingBottom: 40},
  summaryCard: {borderRadius: 16, borderWidth: 1, alignItems: 'center', paddingVertical: 18, marginBottom: 16},
  summaryNum: {fontSize: 32, fontWeight: '900'},
  summaryLbl: {fontSize: 11, fontWeight: '700', marginTop: 4},
  monthNav: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 14},
  monthBtn: {width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  monthBtnTxt: {fontSize: 18, fontWeight: '900'},
  monthLabel: {fontSize: 15, fontWeight: '800', minWidth: 140, textAlign: 'center'},
  sec: {fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8},
  catScroll: {marginHorizontal: -16, marginBottom: 14},
  catRow: {paddingHorizontal: 16, gap: 8},
  catChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9,
  },
  catIcon: {fontSize: 14},
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
