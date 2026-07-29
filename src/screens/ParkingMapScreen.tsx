import React, {useState, useMemo} from 'react';
import {View, Text, StyleSheet, ScrollView, Dimensions} from 'react-native';
import {PressableScale} from '../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {useAppState} from '../context/AppStateContext';
import {Icon} from '../components/Icon';

// 6 slot cells per row, sized to fill a block card exactly:
// screen − page padding (16×2) − card border (1×2) − card padding (14×2)
// − 5 gaps of 8. Floored, or a fractional overshoot wraps the row to 5
// cells and leaves a dead column on the right.
const SLOT_COLS = 6;
const SLOT_GAP = 8;
const SLOT_W = Math.floor(
  (Dimensions.get('window').width - 16 * 2 - 1 * 2 - 14 * 2 - SLOT_GAP * (SLOT_COLS - 1)) / SLOT_COLS,
);

export function ParkingMapScreen() {
  const {colors} = useTheme();
  const {user} = useAuth();
  const {slots} = useAppState();

  // The slot's own live `status`/`doctorId` is the single source of truth
  // for "is this actually my car, right now" — deriving it from task history
  // instead (as this used to) kept painting the old slot as "Your Car" long
  // after retrieval, because a doctor's most recent *completed* task is
  // still their old park task even once the car's been driven away.
  const mySlot = slots.find(sl => sl.status === 'occupied' && sl.doctorId === user?.id)?.id;

  const [picked, setPicked] = useState<string | undefined>(mySlot);
  const pickedSlot = picked ? slots.find(sl => sl.id === picked) : undefined;

  const blocks = useMemo(() => {
    const byBlock = new Map<string, typeof slots>();
    for (const sl of slots) {
      const list = byBlock.get(sl.block) ?? [];
      list.push(sl);
      byBlock.set(sl.block, list);
    }
    return [...byBlock.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => ({
        name,
        slots: list.sort((a, b) => a.number - b.number),
        free: list.filter(sl => sl.status === 'free').length,
      }));
  }, [slots]);

  const occupied = slots.filter(sl => sl.status === 'occupied').length;
  const total = slots.length;
  const available = total - occupied;
  const occupancyPct = total ? Math.round((occupied / total) * 100) : 0;

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Occupancy summary */}
        <View style={[s.summaryCard, {backgroundColor: colors.primary}]}>
          <View style={s.summaryTop}>
            <View>
              <Text style={[s.summaryLbl, {color: colors.textOnPrimary + '99'}]}>OCCUPANCY</Text>
              <Text style={[s.summaryFrac, {color: colors.textOnPrimary}]}>
                {occupied}
                <Text style={[s.summaryTotal, {color: colors.textOnPrimary + '88'}]}> / {total}</Text>
              </Text>
            </View>
            <View style={s.summaryRight}>
              <Text style={[s.summaryPct, {color: colors.textOnPrimary}]}>{occupancyPct}%</Text>
              <Text style={[s.summaryLbl, {color: colors.textOnPrimary + '99'}]}>{available} FREE</Text>
            </View>
          </View>
          <View style={[s.summaryTrack, {backgroundColor: 'rgba(255,255,255,0.2)'}]}>
            <View style={[s.summaryFill, {width: `${occupancyPct}%` as any, backgroundColor: colors.textOnPrimary}]} />
          </View>
        </View>

        {/* Legend + selection */}
        <View style={s.legendRow}>
          {[
            {bg: colors.successLight, br: colors.success, lbl: 'Free'},
            {bg: colors.cardAlt, br: colors.border, lbl: 'Occupied'},
            {bg: colors.primary, br: colors.primary, lbl: mySlot ? 'Your car' : 'Selected'},
          ].map(i => (
            <View key={i.lbl} style={s.legendItem}>
              <View style={[s.legendDot, {backgroundColor: i.bg, borderColor: i.br}]} />
              <Text style={[s.legendTxt, {color: colors.textSecondary}]}>{i.lbl}</Text>
            </View>
          ))}
          <View style={{flex: 1}} />
          {pickedSlot && (
            <View style={[s.pickedChip, {backgroundColor: colors.surface, borderColor: colors.textPrimary}]}>
              <Icon name="pin" size={12} color={colors.textPrimary} />
              <Text style={[s.pickedChipTxt, {color: colors.textPrimary}]}>
                {pickedSlot.id}{pickedSlot.carNumber ? ` · ${pickedSlot.carNumber}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Blocks */}
        {blocks.length === 0 ? (
          <View style={[s.emptyBox, {borderColor: colors.border}]}>
            <Icon name="parking" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No parking slots configured yet</Text>
          </View>
        ) : blocks.map(bl => (
          <View key={bl.name} style={[s.blockCard, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <View style={[s.blockHead, {borderBottomColor: colors.divider}]}>
              <View style={[s.blockBadge, {backgroundColor: colors.cardAlt}]}>
                <Text style={[s.blockBadgeTxt, {color: colors.textPrimary}]}>{bl.name}</Text>
              </View>
              <Text style={[s.blockTitle, {color: colors.textPrimary}]}>Block {bl.name}</Text>
              <Text style={[s.blockFree, {color: bl.free > 0 ? colors.success : colors.error}]}>
                {bl.free > 0 ? `${bl.free} free` : 'Full'}
              </Text>
            </View>
            <View style={s.grid}>
              {bl.slots.map(sl => {
                const isMe = sl.id === mySlot;
                const isSel = sl.id === picked;
                const free = sl.status === 'free';
                const bg = isMe || isSel ? colors.primary : free ? colors.successLight : colors.cardAlt;
                const tc = isMe || isSel ? colors.textOnPrimary : free ? colors.success : colors.textMuted;
                return (
                  <PressableScale
                    key={sl.id}
                    onPress={() => setPicked(sl.id)}
                    style={[s.slot, {backgroundColor: bg, borderColor: isSel && !isMe ? colors.textPrimary : 'transparent'}]}
                  >
                    {isMe
                      ? <Icon name="car" size={15} color={tc} />
                      : <Text style={[s.slotTxt, {color: tc}]}>{sl.number}</Text>}
                  </PressableScale>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: 16, paddingBottom: 40},

  summaryCard: {borderRadius: 20, padding: 18, marginBottom: 16},
  summaryTop: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14},
  summaryLbl: {fontSize: 10, fontWeight: '700', letterSpacing: 1.2},
  summaryFrac: {fontSize: 30, fontWeight: '900', marginTop: 2},
  summaryTotal: {fontSize: 18, fontWeight: '700'},
  summaryRight: {alignItems: 'flex-end'},
  summaryPct: {fontSize: 24, fontWeight: '900'},
  summaryTrack: {height: 8, borderRadius: 4, overflow: 'hidden'},
  summaryFill: {height: '100%', borderRadius: 4},

  legendRow: {flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingHorizontal: 2},
  legendItem: {flexDirection: 'row', alignItems: 'center', gap: 5},
  legendDot: {width: 14, height: 14, borderRadius: 5, borderWidth: 1},
  legendTxt: {fontSize: 11, fontWeight: '600'},
  pickedChip: {flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, borderWidth: 1.5, paddingHorizontal: 10, paddingVertical: 5},
  pickedChipTxt: {fontSize: 11, fontWeight: '800'},

  emptyBox: {borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 24, alignItems: 'center'},
  emptyTxt: {fontSize: 13, fontWeight: '600'},

  blockCard: {borderRadius: 18, borderWidth: 1, marginBottom: 14, overflow: 'hidden'},
  blockHead: {flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderBottomWidth: 1},
  blockBadge: {width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  blockBadgeTxt: {fontSize: 14, fontWeight: '900'},
  blockTitle: {flex: 1, fontSize: 14, fontWeight: '800'},
  blockFree: {fontSize: 12, fontWeight: '700'},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: SLOT_GAP, padding: 14},
  slot: {width: SLOT_W, height: 40, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center'},
  slotTxt: {fontSize: 12, fontWeight: '800'},
});
