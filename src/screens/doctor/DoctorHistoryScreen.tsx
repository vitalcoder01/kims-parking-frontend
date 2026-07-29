import React, {useEffect, useState, useCallback} from 'react';
import {View, Text, StyleSheet, FlatList, StatusBar, RefreshControl} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '../../context/AuthContext';
import {useAppState, ParkingTask} from '../../context/AppStateContext';
import {useTheme} from '../../context/ThemeContext';
import {Icon} from '../../components/Icon';

function formatDate(ms?: number) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  delivered: 'Awaiting pickup confirmation',
  in_transit: 'In transit',
  key_collected: 'Driver has key',
  assigned: 'Assigned',
  requested: 'Requested',
};

export function DoctorHistoryScreen() {
  const {user} = useAuth();
  const {fetchTaskHistory} = useAppState();
  const {colors, isDark} = useTheme();
  const [rows, setRows] = useState<ParkingTask[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!user?.id) return;
    setLoading(true);
    fetchTaskHistory({doctorId: user.id}).then(setRows).catch(() => {}).finally(() => setLoading(false));
  }, [user?.id, fetchTaskHistory]);

  useEffect(() => { load(); }, [load]);

  const renderItem = ({item}: {item: ParkingTask}) => {
    const done = item.status === 'completed';
    const cancelled = item.status === 'cancelled';
    const tone = done ? colors.success : cancelled ? colors.textMuted : colors.warning;
    return (
      <View style={[s.row, {backgroundColor: colors.surface, borderColor: colors.border}]}>
        <View style={[s.iconWrap, {backgroundColor: tone + '18'}]}>
          <Icon name={item.type === 'park' ? 'arrowDown' : 'arrowUp'} size={16} color={tone} />
        </View>
        <View style={{flex: 1}}>
          <Text style={[s.rowTitle, {color: colors.textPrimary}]}>
            {item.type === 'park' ? 'Parked' : 'Retrieved'} · {item.carNumber}
          </Text>
          <Text style={[s.rowSub, {color: colors.textMuted}]}>
            {formatDate(item.assignedAt ?? item.requestedAt)}{item.slotId ? ` · Slot ${item.slotId}` : ''}
          </Text>
        </View>
        <Text style={[s.rowStatus, {color: tone}]}>{STATUS_LABEL[item.status] ?? item.status}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
      <View style={s.header}>
        <Text style={[s.headerTitle, {color: colors.textPrimary}]}>Parking History</Text>
      </View>
      <FlatList
        data={rows}
        keyExtractor={t => String(t.id)}
        renderItem={renderItem}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />}
        ListEmptyComponent={!loading ? (
          <View style={s.emptyWrap}>
            <Icon name="history" size={36} color={colors.textMuted} />
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No past sessions yet.</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  header: {paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16},
  headerTitle: {fontSize: 20, fontWeight: '900'},
  list: {paddingHorizontal: 16, paddingBottom: 40, gap: 10, flexGrow: 1},
  row: {flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14},
  iconWrap: {width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  rowTitle: {fontSize: 14, fontWeight: '800'},
  rowSub: {fontSize: 11, marginTop: 2},
  rowStatus: {fontSize: 11, fontWeight: '700'},
  emptyWrap: {alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 10},
  emptyTxt: {fontSize: 13},
});
