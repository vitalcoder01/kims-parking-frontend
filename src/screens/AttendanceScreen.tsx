import React, {useState} from 'react';
import {
  ScrollView, View, Text, StyleSheet,
  SafeAreaView, TouchableOpacity, Alert,
} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {Badge} from '../components/Badge';

const HISTORY = [
  {date: 'Wed 16 Jul', day: '16', dow: 'Wed', checkIn: '8:03 AM', checkOut: '—',       active: true},
  {date: 'Tue 15 Jul', day: '15', dow: 'Tue', checkIn: '7:58 AM', checkOut: '5:12 PM', active: false},
  {date: 'Mon 14 Jul', day: '14', dow: 'Mon', checkIn: '8:10 AM', checkOut: '4:55 PM', active: false},
  {date: 'Fri 11 Jul', day: '11', dow: 'Fri', checkIn: '8:01 AM', checkOut: '5:03 PM', active: false},
  {date: 'Thu 10 Jul', day: '10', dow: 'Thu', checkIn: '8:22 AM', checkOut: '5:30 PM', active: false},
];

export function AttendanceScreen() {
  const {colors, isDark} = useTheme();
  const [checkedIn, setCheckedIn] = useState(true);

  return (
    <SafeAreaView style={[s.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Today card */}
        <View style={[s.todayCard, {backgroundColor: isDark ? '#001A0D' : '#F0FBF5', borderBottomColor: colors.success + '30'}]}>
          <View style={s.todayHead}>
            <View>
              <Text style={[s.todayEye, {color: colors.success + 'AA'}]}>TODAY · SHIFT ACTIVE</Text>
              <Text style={[s.todayDate, {color: colors.textPrimary}]}>Wednesday, 16 July 2026</Text>
            </View>
            <Badge label={checkedIn ? 'On Duty' : 'Done'} variant={checkedIn ? 'success' : 'muted'} dot />
          </View>

          {/* Timeline */}
          <View style={s.timeline}>
            <View style={s.tlItem}>
              <View style={s.tlLeft}>
                <View style={[s.tlDot, {backgroundColor: colors.success, borderColor: colors.success + '40'}]} />
                <View style={[s.tlLine, {backgroundColor: checkedIn ? colors.success + '50' : colors.success}]} />
              </View>
              <View style={s.tlBody}>
                <Text style={[s.tlLabel, {color: colors.textMuted}]}>CHECK IN</Text>
                <Text style={[s.tlTime, {color: colors.textPrimary}]}>8:03 AM</Text>
                <Text style={[s.tlSub, {color: colors.textSecondary}]}>Gate biometric · Main Building</Text>
              </View>
            </View>

            <View style={s.tlItem}>
              <View style={s.tlLeft}>
                <View style={[
                  s.tlDot,
                  {
                    backgroundColor: checkedIn ? 'transparent' : colors.success,
                    borderColor: checkedIn ? colors.border : colors.success + '40',
                    borderWidth: checkedIn ? 2 : 2,
                  },
                ]} />
              </View>
              <View style={[s.tlBody, {paddingBottom: 0}]}>
                <Text style={[s.tlLabel, {color: colors.textMuted}]}>CHECK OUT</Text>
                <Text style={[s.tlTime, {color: checkedIn ? colors.textMuted : colors.textPrimary}]}>
                  {checkedIn ? 'In progress...' : '5:00 PM'}
                </Text>
                {!checkedIn && (
                  <Text style={[s.tlSub, {color: colors.textSecondary}]}>Gate biometric · Main Building</Text>
                )}
              </View>
            </View>
          </View>

          {checkedIn && (
            <TouchableOpacity
              activeOpacity={0.82}
              style={[s.coBtn, {borderColor: colors.error + '40', backgroundColor: colors.error + '0D'}]}
              onPress={() =>
                Alert.alert('End Shift', 'Confirm check out for today?', [
                  {text: 'Cancel', style: 'cancel'},
                  {text: 'Confirm', style: 'destructive', onPress: () => setCheckedIn(false)},
                ])
              }>
              <Text style={[s.coBtnTxt, {color: colors.error}]}>End Shift</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.pad}>

          {/* Monthly stats */}
          <Text style={[s.sec, {color: colors.textMuted}]}>JULY 2026</Text>
          <View style={s.statsRow}>
            {[
              {n: '14', l: 'Present', c: colors.success},
              {n: '1',  l: 'Leave',   c: '#1A72E8'},
              {n: '0',  l: 'Absent',  c: colors.textMuted},
            ].map(st => (
              <View key={st.l} style={[s.statCard, {backgroundColor: colors.card, borderColor: colors.border}]}>
                <Text style={[s.statNum, {color: st.c}]}>{st.n}</Text>
                <Text style={[s.statLbl, {color: colors.textMuted}]}>{st.l}</Text>
              </View>
            ))}
          </View>

          {/* History */}
          <Text style={[s.sec, {color: colors.textMuted}]}>RECENT HISTORY</Text>
          <View style={[s.sheet, {backgroundColor: colors.card, borderColor: colors.border}]}>
            {HISTORY.map((row, i) => (
              <View
                key={row.date}
                style={[
                  s.histRow,
                  {borderBottomColor: colors.divider},
                  i === HISTORY.length - 1 && {borderBottomWidth: 0},
                ]}>
                <View style={[
                  s.datePill,
                  {
                    backgroundColor: row.active ? colors.success + '18' : colors.cardAlt,
                    borderColor: row.active ? colors.success + '40' : colors.border,
                  },
                ]}>
                  <Text style={[s.datePillNum, {color: row.active ? colors.success : colors.textPrimary}]}>
                    {row.day}
                  </Text>
                  <Text style={[s.datePillDow, {color: row.active ? colors.success + 'BB' : colors.textMuted}]}>
                    {row.dow}
                  </Text>
                </View>
                <View style={{flex: 1}}>
                  <View style={s.timePair}>
                    <Text style={[s.timeIn, {color: colors.textPrimary}]}>{row.checkIn}</Text>
                    <Text style={[s.timeArrow, {color: colors.textMuted}]}> → </Text>
                    <Text style={[s.timeOut, {color: row.active ? colors.textMuted : colors.textPrimary}]}>
                      {row.checkOut}
                    </Text>
                  </View>
                </View>
                {row.active
                  ? <Badge label="Live" variant="success" dot />
                  : <Badge label="Done" variant="muted" />}
              </View>
            ))}
          </View>

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},
  scroll: {paddingBottom: 40},

  todayCard: {borderBottomWidth: 1, padding: 16, paddingBottom: 0},
  todayHead: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 20,
  },
  todayEye: {fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 5},
  todayDate: {fontSize: 15, fontWeight: '800'},

  timeline: {marginBottom: 16},
  tlItem: {flexDirection: 'row', alignItems: 'stretch'},
  tlLeft: {alignItems: 'center', width: 32},
  tlDot: {width: 18, height: 18, borderRadius: 9, borderWidth: 2, flexShrink: 0},
  tlLine: {width: 2, flex: 1, marginTop: 3, marginBottom: 3},
  tlBody: {flex: 1, paddingLeft: 10, paddingBottom: 20},
  tlLabel: {fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase'},
  tlTime: {fontSize: 22, fontWeight: '900', marginTop: 3},
  tlSub: {fontSize: 11, marginTop: 3},

  coBtn: {borderRadius: 12, borderWidth: 1, paddingVertical: 13, alignItems: 'center', marginBottom: 16},
  coBtnTxt: {fontSize: 14, fontWeight: '800'},

  pad: {padding: 16},
  sec: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.3,
    textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  },

  statsRow: {flexDirection: 'row', gap: 8, marginBottom: 16},
  statCard: {flex: 1, borderRadius: 14, borderWidth: 1, paddingVertical: 14, alignItems: 'center'},
  statNum: {fontSize: 28, fontWeight: '900'},
  statLbl: {fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4},

  sheet: {borderRadius: 18, borderWidth: 1, overflow: 'hidden'},
  histRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  datePill: {
    width: 42, borderRadius: 10, borderWidth: 1,
    paddingVertical: 7, alignItems: 'center',
  },
  datePillNum: {fontSize: 17, fontWeight: '900', lineHeight: 20},
  datePillDow: {fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4},
  timePair: {flexDirection: 'row', alignItems: 'center'},
  timeIn: {fontSize: 13, fontWeight: '700'},
  timeArrow: {fontSize: 12},
  timeOut: {fontSize: 13, fontWeight: '700'},
});
