import React, {useState} from 'react';
import {
  ScrollView, View, Text, StyleSheet, SafeAreaView,
  TouchableOpacity, Alert,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {Badge} from '../components/Badge';

const TIME_OPTIONS = [
  {value: 10, label: '10', eta: '11:07 AM'},
  {value: 15, label: '15', eta: '11:12 AM'},
  {value: 20, label: '20', eta: '11:17 AM'},
  {value: 30, label: '30', eta: '11:27 AM'},
];

const VEHICLE_ROWS: [string, string][] = [
  ['Reg. Number', 'MH-02-AB-1234'],
  ['Model',       'Maruti Swift Dzire'],
  ['Color',       'Pearl White'],
  ['Parked By',   'Suresh Kumar · Driver'],
  ['Location',    'Block A · 2nd Floor'],
  ['Duration',    '1h 22 min'],
];

export function ParkingScreen() {
  const {colors, isDark} = useTheme();
  const [selectedTime, setSelectedTime] = useState<number | null>(null);
  const selected = TIME_OPTIONS.find(t => t.value === selectedTime);

  const handleRequest = () => {
    if (!selectedTime) {Alert.alert('Select Time', 'Please choose when you are leaving.'); return;}
    Alert.alert('Retrieval Requested ✓', `Your car will be ready at Gate 1 by ${selected?.eta}.`);
  };

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Session strip */}
        <View style={[s.strip, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
          <Text style={[s.session, {color: colors.textMuted}]}>SESSION #P-2047</Text>
          <Badge label="Parked" variant="success" dot />
        </View>

        {/* Slot hero */}
        <View style={[s.hero, {backgroundColor: isDark ? '#1A0A00' : '#FFF4EE', borderBottomColor: colors.primary + '28'}]}>
          <Text style={[s.heroEye, {color: colors.primary + 'AA'}]}>PARKING SLOT</Text>
          <Text style={[s.heroNum, {color: colors.textPrimary}]}>
            A-<Text style={{color: colors.primary}}>203</Text>
          </Text>
          <Text style={[s.heroSub, {color: colors.textSecondary}]}>Block A · 2nd Floor · Parked at 9:52 AM</Text>
          <View style={[s.heroAccent, {backgroundColor: colors.primary}]} />
        </View>

        <View style={s.pad}>

          {/* Vehicle info */}
          <Text style={[s.sec, {color: colors.textMuted}]}>VEHICLE INFO</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {VEHICLE_ROWS.map(([lbl, val], i) => (
              <View
                key={lbl}
                style={[s.infoRow, {borderBottomColor: colors.divider}, i === VEHICLE_ROWS.length - 1 && {borderBottomWidth: 0}]}>
                <Text style={[s.infoLbl, {color: colors.textSecondary}]}>{lbl}</Text>
                <Text style={[s.infoVal, {color: colors.textPrimary}]}>{val}</Text>
              </View>
            ))}
          </View>

          {/* Retrieval */}
          <Text style={[s.sec, {color: colors.textMuted}]}>REQUEST RETRIEVAL</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            <Text style={[s.whenQ, {color: colors.textPrimary}]}>When do you need your car?</Text>
            <Text style={[s.whenSub, {color: colors.textSecondary}]}>We'll have it ready at Gate 1 in time.</Text>

            <View style={s.chipRow}>
              {TIME_OPTIONS.map(opt => {
                const on = selectedTime === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    activeOpacity={0.7}
                    onPress={() => setSelectedTime(opt.value)}
                    style={[
                      s.chip,
                      {
                        backgroundColor: on ? colors.primary + '14' : colors.cardAlt,
                        borderColor: on ? colors.primary : colors.border,
                      },
                    ]}>
                    <Text style={[s.chipNum, {color: on ? colors.primary : colors.textPrimary}]}>{opt.label}</Text>
                    <Text style={[s.chipUnit, {color: on ? colors.primary + 'AA' : colors.textMuted}]}>min</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {selected && (
              <View style={[s.etaCard, {backgroundColor: colors.success + '10', borderColor: colors.success + '30'}]}>
                <View>
                  <Text style={[s.etaLbl, {color: colors.textMuted}]}>Car ready at Gate 1 by</Text>
                  <Text style={[s.etaVal, {color: colors.success}]}>{selected.eta}</Text>
                </View>
                <Text style={s.etaIcon}>🚗</Text>
              </View>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleRequest}
              style={[
                s.cta,
                {
                  backgroundColor: selectedTime ? colors.primary : colors.border,
                  shadowColor: colors.primary,
                },
              ]}>
              <Text style={[s.ctaTxt, {color: selectedTime ? '#fff' : colors.textMuted}]}>
                {selectedTime ? `Confirm — Leaving in ${selectedTime} min` : 'Select a time above'}
              </Text>
              {selectedTime ? <Text style={s.ctaArrow}>→</Text> : null}
            </TouchableOpacity>
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {paddingBottom: 40},

  strip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1,
  },
  session: {fontSize: 10, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase'},

  hero: {borderBottomWidth: 1, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 24, alignItems: 'center'},
  heroEye: {fontSize: 9, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10},
  heroNum: {fontSize: 80, fontWeight: '900', letterSpacing: -3, lineHeight: 84},
  heroSub: {fontSize: 12, marginTop: 8},
  heroAccent: {width: 40, height: 3, borderRadius: 2, marginTop: 18},

  pad: {padding: 16},
  sec: {fontSize: 10, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8, marginTop: 10},
  sheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 4},

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1,
  },
  infoLbl: {fontSize: 12},
  infoVal: {fontSize: 13, fontWeight: '700'},

  whenQ: {fontSize: 15, fontWeight: '800', paddingHorizontal: 14, paddingTop: 14, marginBottom: 3},
  whenSub: {fontSize: 12, paddingHorizontal: 14, marginBottom: 14},

  chipRow: {flexDirection: 'row', gap: 8, paddingHorizontal: 14},
  chip: {
    flex: 1, borderRadius: 14, borderWidth: 1.5,
    paddingVertical: 16, alignItems: 'center',
  },
  chipNum: {fontSize: 26, fontWeight: '900', lineHeight: 30},
  chipUnit: {fontSize: 9, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginTop: 3},

  etaCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    margin: 14, marginTop: 12, borderRadius: 14, borderWidth: 1, padding: 14,
  },
  etaLbl: {fontSize: 10, fontWeight: '600'},
  etaVal: {fontSize: 24, fontWeight: '900', marginTop: 3},
  etaIcon: {fontSize: 30},

  cta: {
    margin: 14, marginTop: 8, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.2, shadowRadius: 12, elevation: 6,
  },
  ctaTxt: {fontSize: 14, fontWeight: '900'},
  ctaArrow: {fontSize: 16, color: '#fff', fontWeight: '900'},
});
