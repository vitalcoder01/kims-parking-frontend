import React, {useEffect, useState} from 'react';
import {View, Text, StyleSheet, ScrollView} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {PressableScale} from '../../components/PressableScale';
import {Icon, IconName} from '../../components/Icon';
import {HScrollHint} from '../../components/HScrollHint';
import {spacing, radius, typography} from '../../theme';

// Ports kims-parking-web's Mobbin-researched redesign of this same screen —
// "understand the whole operation in 3-5 seconds, details only after
// tapping." The old version put a 2x2 metric grid, a full block-by-block
// list AND a full driver list on one screen — all real data, arranged so
// nothing read faster than scrolling to the bottom. This shows one compact
// occupancy card (overall + per-block chips, no 90-slot render), at most 3
// live operations with a way to see more, and a compact driver strip — the
// full roster is one tap away on Staff. No map tab exists on mobile admin
// (unlike web), so the occupancy card is informational only, not tappable.
type StatusTone = 'success' | 'info' | 'warning' | 'muted';

function taskStatusLabel(t: {type: string; status: string}): {label: string; tone: StatusTone; isLive: boolean} {
  if (t.status === 'requested' || t.status === 'accepted' || t.status === 'assigned') {
    return {label: 'Awaiting driver', tone: 'warning', isLive: true};
  }
  if (t.status === 'key_collected') return {label: 'Key collected', tone: 'info', isLive: true};
  if (t.status === 'in_transit') return {label: t.type === 'park' ? 'Parking' : 'Retrieving', tone: 'info', isLive: true};
  if (t.status === 'delivered') return {label: 'Delivered', tone: 'success', isLive: true};
  return {label: t.type === 'park' ? 'Parked' : 'Retrieved', tone: 'success', isLive: false};
}

function taskActivityTime(t: {completedAt?: number; startedAt?: number; keyCollectedAt?: number; assignedAt?: number; requestedAt?: number}): number {
  return t.completedAt ?? t.startedAt ?? t.keyCollectedAt ?? t.assignedAt ?? t.requestedAt ?? 0;
}

function relativeAgo(ms: number): string {
  if (!ms) return '';
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

// How long a completed job still counts as "live" — long enough to see what
// just happened, short enough to stay a snapshot, not a history log.
const RECENT_COMPLETION_MS = 2 * 60 * 60 * 1000;

export function AdminDashboardScreen() {
  const {colors} = useTheme();
  const {user} = useAuth();
  const {tasks, drivers, slots} = useAppState();
  const navigation = useNavigation<any>();

  const [showAllOps, setShowAllOps] = useState(false);

  const liveTasks = tasks
    .filter(t => t.status !== 'cancelled')
    .filter(t => t.status !== 'completed' || (t.completedAt != null && Date.now() - t.completedAt < RECENT_COMPLETION_MS))
    .sort((a, b) => taskActivityTime(b) - taskActivityTime(a));
  const occupied = slots.filter(s => s.status === 'occupied').length;
  const total = slots.length;
  const free = total - occupied;
  const occupancyPct = total ? Math.round((occupied / total) * 100) : 0;
  const fillColor = occupancyPct > 90 ? colors.error : occupancyPct > 70 ? colors.warning : colors.success;

  const blockStats = React.useMemo(() => {
    const byBlock = new Map<string, {total: number; used: number}>();
    for (const sl of slots) {
      const entry = byBlock.get(sl.block) ?? {total: 0, used: 0};
      entry.total += 1;
      if (sl.status === 'occupied') entry.used += 1;
      byBlock.set(sl.block, entry);
    }
    return [...byBlock.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, v]) => ({name, ...v}));
  }, [slots]);

  const availableDrivers = drivers.filter(d => d.status === 'available');
  const today = new Date().toLocaleDateString(undefined, {weekday: 'long', month: 'long', day: 'numeric'});

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View style={[s.avatar, {backgroundColor: colors.primary}]}>
            <Text style={[s.avatarTxt, {color: colors.textOnPrimary}]}>
              {(user?.name ?? 'Admin').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </Text>
          </View>
          <View style={{flex: 1, minWidth: 0}}>
            <Text style={[s.hName, {color: colors.textPrimary}]} numberOfLines={1}>{user?.name ?? 'Admin'}</Text>
            <Text style={[s.hDate, {color: colors.textMuted}]}>{today}</Text>
          </View>
          <View style={[s.liveChip, {backgroundColor: colors.card, borderColor: colors.border}]}>
            <View style={[s.liveDot, {backgroundColor: colors.success}]} />
            <Text style={[s.liveTxt, {color: colors.textSecondary}]}>Live</Text>
          </View>
        </View>

        <View style={s.pad}>

          {/* Compact occupancy overview — the ONE number that matters
              first, block breakdown as chips, not a 90-slot render. */}
          <View style={[s.card, {backgroundColor: colors.card, borderColor: colors.border, padding: 20}]}>
            <View style={s.ocvHead}>
              <View>
                <Text style={[s.ocvLabel, {color: colors.textMuted}]}>PARKING</Text>
                <View style={s.ocvRow}>
                  <Text style={[s.ocvBig, {color: colors.success}]}>{free}</Text>
                  <Text style={[s.ocvUnit, {color: colors.textMuted}]}>FREE</Text>
                </View>
                <View style={[s.ocvRow, {marginTop: 2}]}>
                  <Text style={[s.ocvMid, {color: colors.textPrimary}]}>{occupied}</Text>
                  <Text style={[s.ocvUnit, {color: colors.textMuted}]}>OCCUPIED</Text>
                </View>
              </View>
              <View style={{alignItems: 'flex-end'}}>
                <Text style={[s.ocvPct, {color: fillColor}]}>{occupancyPct}%</Text>
                <Text style={[s.ocvPctLbl, {color: colors.textMuted}]}>FULL</Text>
              </View>
            </View>

            <View style={[s.segTrack, {backgroundColor: colors.cardAlt}]}>
              {blockStats.map(b => (
                <View key={b.name} style={{flex: total ? b.total / total : 0}}>
                  <View style={[s.segFill, {width: `${b.total ? (b.used / b.total) * 100 : 0}%` as any, backgroundColor: fillColor}]} />
                </View>
              ))}
            </View>

            {blockStats.length === 0 ? (
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No parking slots configured yet</Text>
            ) : (
              <HScrollHint fadeColor={colors.card} contentContainerStyle={{gap: 8}}>
                {blockStats.map(b => (
                  <View key={b.name} style={[s.blockChip, {backgroundColor: colors.cardAlt}]}>
                    <Text style={[s.blockChipTxt, {color: colors.textPrimary}]}>Block {b.name}</Text>
                    <Text style={[s.blockChipNum, {color: colors.textMuted}]}>{b.used}/{b.total}</Text>
                  </View>
                ))}
              </HScrollHint>
            )}
          </View>

          {/* Live operations — 2-3 active jobs, not an endless feed. */}
          <View style={s.secRow}>
            <Text style={[s.sec, {color: colors.textPrimary}]}>Live Operations</Text>
            {liveTasks.length > 3 && (
              <PressableScale onPress={() => setShowAllOps(v => !v)}>
                <Text style={[s.secAction, {color: colors.primary}]}>
                  {showAllOps ? 'Show less' : `View all (${liveTasks.length}) →`}
                </Text>
              </PressableScale>
            )}
          </View>
          <View style={[s.card, {backgroundColor: colors.card, borderColor: colors.border, overflow: 'hidden'}]}>
            {liveTasks.length === 0 ? (
              <Text style={[s.emptyTxt, {color: colors.textMuted, padding: spacing.xl}]}>No active operations right now</Text>
            ) : (showAllOps ? liveTasks : liveTasks.slice(0, 3)).map((t, i, arr) => {
              const st = taskStatusLabel(t);
              const toneColor = st.tone === 'success' ? colors.success : st.tone === 'info' ? colors.info : st.tone === 'warning' ? colors.warning : colors.textMuted;
              const ago = relativeAgo(taskActivityTime(t));
              return (
                <View key={t.id} style={[s.opRow, i < arr.length - 1 && {borderBottomWidth: 1, borderBottomColor: colors.divider}]}>
                  {/* Left accent bar, colored by status tone — scan the
                      color, not the words, to read the list at a glance. */}
                  <View style={[s.opStripe, {backgroundColor: toneColor}]} />
                  <View style={[s.opIcon, {backgroundColor: colors.cardAlt}]}>
                    <Icon name={t.type === 'park' ? 'car' : 'refresh'} size={15} color={colors.textPrimary} />
                  </View>
                  <View style={{flex: 1, minWidth: 0}}>
                    <Text style={[s.opCar, {color: colors.textPrimary}]}>{t.carNumber}</Text>
                    <Text style={[s.opMeta, {color: colors.textMuted}]} numberOfLines={1}>
                      {t.doctorName}{t.slotId ? ` · ${t.slotId}` : ''}{t.driverName ? ` · ${t.driverName}` : ''}
                    </Text>
                  </View>
                  <View style={{alignItems: 'flex-end', gap: 3}}>
                    <Text style={[s.opStatus, {color: toneColor}]}>{st.label.toUpperCase()}</Text>
                    {!!ago && <Text style={[s.opAgo, {color: colors.textMuted}]}>{ago}</Text>}
                  </View>
                </View>
              );
            })}
          </View>

          {/* Drivers — compact strip, full roster is one tap away on Staff. */}
          <View style={s.secRow}>
            <Text style={[s.sec, {color: colors.textPrimary}]}>Drivers</Text>
            <PressableScale onPress={() => navigation.navigate('Staff')}>
              <Text style={[s.secAction, {color: colors.primary}]}>View all →</Text>
            </PressableScale>
          </View>
          <View style={[s.card, {backgroundColor: colors.card, borderColor: colors.border, padding: 14}]}>
            {drivers.length === 0 ? (
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No drivers added yet</Text>
            ) : (
              <>
                <HScrollHint fadeColor={colors.card} contentContainerStyle={{gap: 14, paddingBottom: 4}}>
                  {drivers.map(d => {
                    const tone = d.status === 'off' ? colors.textMuted : d.status === 'busy' ? colors.warning : colors.success;
                    return (
                      <View key={d.id} style={s.driverCol}>
                        <View>
                          <View style={[s.driverAvatar, {backgroundColor: colors.cardAlt}]}>
                            <Text style={[s.driverAvatarTxt, {color: colors.textPrimary}]}>{d.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</Text>
                          </View>
                          <View style={[s.driverDot, {backgroundColor: tone, borderColor: colors.card}]} />
                        </View>
                        <Text style={[s.driverName, {color: colors.textSecondary}]} numberOfLines={1}>{d.name.split(' ')[0]}</Text>
                      </View>
                    );
                  })}
                </HScrollHint>
                <Text style={[s.driverSummary, {color: colors.textMuted, borderTopColor: colors.divider}]}>
                  {availableDrivers.length} of {drivers.length} available
                </Text>
              </>
            )}
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {paddingBottom: 40},

  header: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 16, paddingTop: 20, paddingBottom: 16},
  avatar: {width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  avatarTxt: {fontSize: typography.sizes.base, fontWeight: typography.weights.bold},
  hName: {fontSize: typography.sizes['2xl'], fontWeight: '900', letterSpacing: -0.5},
  hDate: {fontSize: typography.sizes.sm, marginTop: 2},
  liveChip: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1},
  liveDot: {width: 6, height: 6, borderRadius: 3},
  liveTxt: {fontSize: typography.sizes.xs, fontWeight: '700'},

  pad: {paddingHorizontal: spacing.base},
  card: {borderRadius: radius['2xl'], borderWidth: 1},

  ocvHead: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16},
  ocvLabel: {fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4},
  ocvRow: {flexDirection: 'row', alignItems: 'baseline', gap: 10},
  ocvBig: {fontSize: typography.sizes['4xl'], fontWeight: '900', lineHeight: 38},
  ocvMid: {fontSize: typography.sizes.xl, fontWeight: '900', lineHeight: 22},
  ocvUnit: {fontSize: 12, fontWeight: '700'},
  ocvPct: {fontSize: typography.sizes['2xl'], fontWeight: '900'},
  ocvPctLbl: {fontSize: 10, fontWeight: '700'},

  segTrack: {height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', marginBottom: 14},
  segFill: {height: '100%'},

  emptyTxt: {fontSize: 12, fontWeight: '600', textAlign: 'center'},

  blockChip: {flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.full},
  blockChipTxt: {fontSize: 12, fontWeight: '800'},
  blockChipNum: {fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums']},

  secRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm},
  sec: {fontSize: typography.sizes.base, fontWeight: '900', letterSpacing: -0.2},
  secAction: {fontSize: 12, fontWeight: '700'},

  opRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 13, paddingHorizontal: 16},
  opStripe: {width: 3, alignSelf: 'stretch', borderRadius: 2},
  opIcon: {width: 34, height: 34, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center'},
  opCar: {fontSize: 13, fontWeight: '800', letterSpacing: 0.3},
  opMeta: {fontSize: 11, marginTop: 2},
  opStatus: {fontSize: 10.5, fontWeight: '800'},
  opAgo: {fontSize: 10, fontWeight: '600'},

  driverCol: {alignItems: 'center', gap: 5, width: 56},
  driverAvatar: {width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center'},
  driverAvatarTxt: {fontSize: 12, fontWeight: '800'},
  driverDot: {position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2},
  driverName: {fontSize: 10.5, fontWeight: '700', maxWidth: 56},
  driverSummary: {fontSize: 11.5, fontWeight: '700', marginTop: 10, paddingTop: 10, borderTopWidth: 1},
});
