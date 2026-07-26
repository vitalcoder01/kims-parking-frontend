import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, ActivityIndicator, RefreshControl} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {Badge} from '../../components/Badge';
import {adminApi} from '../../services/api';

interface Row {
  id: string;
  userId: string;
  name: string;
  role: string;
  employeeId: string;
  checkIn: string | null;
  checkOut: string | null;
  vehiclesHandled: number;
  gate?: string | null;
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});
}

const roleLabel: Record<string, string> = {doctor: 'Doctor', staff: 'Staff', valet: 'Valet', driver: 'Driver', admin: 'Admin'};

export function AdminAttendanceScreen() {
  const {colors} = useTheme();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await adminApi.attendanceToday();
      setRows(data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const present = rows.filter(r => r.checkIn && !r.checkOut).length;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
      >
        <View style={[s.summaryCard, {backgroundColor: colors.card, borderColor: colors.border}]}>
          <Text style={[s.summaryNum, {color: colors.success}]}>{present}</Text>
          <Text style={[s.summaryLbl, {color: colors.textMuted}]}>Present right now</Text>
        </View>

        <Text style={[s.sec, {color: colors.textMuted}]}>TODAY — MARKED AUTOMATICALLY</Text>
        {rows.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>Nobody has been marked present yet today</Text>
          </View>
        ) : (
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {rows.map((r, i) => (
              <View key={r.id} style={[s.row, {borderBottomColor: colors.divider}, i === rows.length - 1 && {borderBottomWidth: 0}]}>
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
  sec: {fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8},
  sheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden'},
  emptyBox: {borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 24, alignItems: 'center'},
  emptyTxt: {fontSize: 13, fontWeight: '600'},
  row: {flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1},
  name: {fontSize: 13, fontWeight: '700'},
  meta: {fontSize: 11, marginTop: 2},
  vehicles: {fontSize: 11, fontWeight: '700'},
});
