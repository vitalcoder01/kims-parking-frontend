import React, {useState} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {useAppState} from '../../context/AppStateContext';
import {Badge} from '../../components/Badge';

type Filter = 'all' | 'valet' | 'driver';

const STATIC_STAFF = [
  {id: 'VAL-012', name: 'Rajan Mehta',  role: 'valet',  shift: '8AM–4PM',  status: 'on_duty', tasks: 12, location: 'Gate 1'},
  {id: 'VAL-015', name: 'Deepa Rao',    role: 'valet',  shift: '4PM–12AM', status: 'off_duty', tasks: 0,  location: '—'},
];

const FILTER_TABS: {key: Filter; label: string}[] = [
  {key: 'all',    label: 'All'},
  {key: 'valet',  label: 'Valets'},
  {key: 'driver', label: 'Drivers'},
];

export function AdminStaffScreen() {
  const {colors} = useTheme();
  const {drivers, tasks} = useAppState();
  const [filter, setFilter] = useState<Filter>('all');

  const driverStaff = drivers.map(d => ({
    id: d.id,
    name: d.name,
    role: 'driver' as const,
    shift: '8AM–4PM',
    status: d.status === 'available' ? 'on_duty' : d.status === 'busy' ? 'on_task' : 'off_duty',
    tasks: tasks.filter(t => t.driverId === d.id && t.status === 'completed').length,
    location: d.status === 'busy' ? 'On Route' : 'Gate',
  }));

  const allStaff = [...STATIC_STAFF, ...driverStaff];
  const filtered = filter === 'all' ? allStaff : allStaff.filter(s => s.role === filter);

  const onDuty  = allStaff.filter(s => s.status !== 'off_duty').length;
  const onTask  = allStaff.filter(s => s.status === 'on_task').length;
  const offDuty = allStaff.filter(s => s.status === 'off_duty').length;

  const statusBadge = (status: string) => {
    if (status === 'on_task')  return <Badge label="On Task"  variant="warning" dot />;
    if (status === 'on_duty')  return <Badge label="On Duty"  variant="success" dot />;
    return                            <Badge label="Off Duty" variant="muted"        />;
  };

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Summary */}
        <View style={s.statsRow}>
          {[
            {n: String(onDuty),  l: 'On Duty',  c: colors.success},
            {n: String(onTask),  l: 'On Task',  c: colors.warning},
            {n: String(offDuty), l: 'Off Duty', c: colors.textMuted},
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
        <View style={[s.listCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
          {filtered.map((st, i) => (
            <View key={st.id} style={[s.staffRow, {borderBottomColor: colors.border}, i === filtered.length - 1 && {borderBottomWidth: 0}]}>
              <View style={[s.avatar, {backgroundColor: st.status === 'off_duty' ? colors.background : colors.primary + '22'}]}>
                <Text style={[s.avatarText, {color: st.status === 'off_duty' ? colors.textMuted : colors.primary}]}>
                  {st.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                </Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={[s.staffName, {color: colors.textPrimary}]}>{st.name}</Text>
                <Text style={[s.staffRole, {color: colors.textSecondary}]}>
                  {st.role === 'valet' ? 'Valet' : 'Driver'} · {st.id}
                </Text>
                <Text style={[s.staffLoc, {color: colors.textMuted}]}>{st.shift} · {st.location}</Text>
              </View>
              <View style={s.staffRight}>
                {statusBadge(st.status)}
                {st.tasks > 0 && <Text style={[s.taskCount, {color: colors.primary}]}>{st.tasks} tasks</Text>}
              </View>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},
  statsRow: {flexDirection: 'row', gap: 10, marginBottom: 12},
  statCard: {flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 14, borderWidth: 1},
  statNum: {fontSize: 24, fontWeight: '900'},
  statLabel: {fontSize: 11, fontWeight: '600', marginTop: 2},
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
  taskCount: {fontSize: 11, fontWeight: '700'},
});
