import React, {useState, useMemo} from 'react';
import {View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {useAuth} from '../context/AuthContext';
import {useAppState} from '../context/AppStateContext';

export function ParkingMapScreen() {
  const {colors, isDark} = useTheme();
  const {user} = useAuth();
  const {slots} = useAppState();

  // The slot's own live `status`/`doctorId` is the single source of truth
  // for "is this actually my car, right now" — deriving it from task history
  // instead (as this used to) kept painting the old slot as "Your Car" long
  // after retrieval, because a doctor's most recent *completed* task is
  // still their old park task even once the car's been driven away.
  const mySlot = slots.find(sl => sl.status === 'occupied' && sl.doctorId === user?.id)?.id;

  const [picked, setPicked] = useState<string | undefined>(mySlot);

  const blocks = useMemo(() => {
    const byBlock = new Map<string, typeof slots>();
    for (const sl of slots) {
      const list = byBlock.get(sl.block) ?? [];
      list.push(sl);
      byBlock.set(sl.block, list);
    }
    return [...byBlock.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, list]) => ({name: `Block ${name}`, slots: list.sort((a, b) => a.number - b.number)}));
  }, [slots]);

  const occupied = slots.filter(sl => sl.status === 'occupied').length;
  const total = slots.length;
  const available = total - occupied;
  const occupancyPct = total ? Math.round((occupied / total) * 100) : 0;

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={[s.leg, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
          {[{col: colors.primary, lbl: 'Your Car'}, {col: isDark ? '#0D2A1C' : '#E8F8EE', lbl: 'Free'}, {col: isDark ? '#2A2A2A' : '#E8E8E8', lbl: 'Occupied'}].map(i => (
            <View key={i.lbl} style={s.legItem}><View style={[s.legDot, {backgroundColor: i.col}]} /><Text style={[s.legTxt, {color: colors.textSecondary}]}>{i.lbl}</Text></View>
          ))}
          <View style={{flex: 1}} />
          {picked && (
            <View style={[s.mySlot, {backgroundColor: colors.primary + '15', borderColor: colors.primary + '44'}]}>
              <Text style={[s.mySlotT, {color: colors.primary}]}>📍 {picked}</Text>
            </View>
          )}
        </View>
        <View style={s.pad}>
          {blocks.length === 0 ? (
            <Text style={[s.emptyTxt, {color: colors.textMuted}]}>No parking slots configured yet</Text>
          ) : blocks.map(bl => (
            <View key={bl.name} style={s.blkWrap}>
              <Text style={[s.blkName, {color: colors.textPrimary}]}>{bl.name}</Text>
              <View style={s.grid}>
                {bl.slots.map(sl => {
                  const isMe = sl.id === mySlot, isSel = sl.id === picked;
                  const bg = isMe ? colors.primary : isSel ? colors.primary + 'CC' : sl.status === 'free' ? (isDark ? '#0D2A1C' : '#DCF5E7') : (isDark ? '#252525' : '#EFEFEF');
                  const tc = isMe || isSel ? '#fff' : sl.status === 'free' ? colors.success : colors.textMuted;
                  return (
                    <TouchableOpacity key={sl.id} activeOpacity={0.7} onPress={() => setPicked(sl.id)}
                      style={[s.slot, {backgroundColor: bg, borderColor: isSel ? colors.primary : colors.border, borderWidth: isSel ? 2 : 1}]}>
                      <Text style={[s.slotT, {color: tc}]}>{isMe ? '🚗' : ''}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
          <View style={[s.stats, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {[{n: String(occupied), l: 'Occupied', c: colors.textPrimary}, {n: String(available), l: 'Available', c: colors.success}, {n: String(total), l: 'Total', c: colors.primary}, {n: `${occupancyPct}%`, l: 'Occupancy', c: colors.warning}].map(st => (
              <View key={st.l} style={s.stIt}><Text style={[s.stN, {color: st.c}]}>{st.n}</Text><Text style={[s.stL, {color: colors.textMuted}]}>{st.l}</Text></View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: {flex: 1}, scroll: {paddingBottom: 32},
  leg: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, gap: 12},
  legItem: {flexDirection: 'row', alignItems: 'center', gap: 5}, legDot: {width: 12, height: 12, borderRadius: 3}, legTxt: {fontSize: 11, fontWeight: '600'},
  mySlot: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1}, mySlotT: {fontSize: 11, fontWeight: '800'},
  pad: {padding: 16}, blkWrap: {marginBottom: 20}, blkName: {fontSize: 14, fontWeight: '900', marginBottom: 10},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 4},
  slot: {width: '11.5%', height: 34, borderRadius: 6, alignItems: 'center', justifyContent: 'center'}, slotT: {fontSize: 10, fontWeight: '700'},
  emptyTxt: {fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 20},
  stats: {flexDirection: 'row', borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 4},
  stIt: {flex: 1, alignItems: 'center'}, stN: {fontSize: 20, fontWeight: '900'}, stL: {fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4},
});
