import React, {useState} from 'react';
import {View, Text, StyleSheet, Modal, Pressable} from 'react-native';
import {useTheme} from '../context/ThemeContext';
import {Icon} from './Icon';
import {PressableScale} from './PressableScale';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad(n: number) { return n < 10 ? `0${n}` : `${n}`; }
function toKey(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

/**
 * Month-grid date picker, built from scratch rather than the platform
 * DateTimePicker — that renders as a native OS wheel/calendar with its own
 * chrome that can't be made to match the app's theme (light/dark tokens,
 * warm-mono palette, rounded ticket-card language everything else here
 * uses), which is exactly the "professional, on-brand" bar this needed to
 * clear. Selection-only (no range) — every caller so far wants a single
 * calendar day.
 */
export function CalendarPicker({
  visible, value, maxDate, onSelect, onClose,
}: {
  visible: boolean;
  /** 'YYYY-MM-DD', or undefined for no day highlighted. */
  value?: string;
  /** Days after this (local) are disabled — records views have nothing to
   *  show for a future date. Defaults to today. */
  maxDate?: Date;
  onSelect: (date: string) => void;
  onClose: () => void;
}) {
  const {colors} = useTheme();
  const today = new Date();
  const cap = maxDate ?? today;
  const initial = value ? new Date(`${value}T00:00:00`) : today;
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const capKey = toKey(cap.getFullYear(), cap.getMonth(), cap.getDate());
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({length: startWeekday}, () => null),
    ...Array.from({length: daysInMonth}, (_, i) => i + 1),
  ];
  // The current month view is "at the cap" once it's the same month/year as
  // the max selectable date — that's what disables the next-month arrow
  // (there's nothing selectable past it, so nothing to page forward to).
  const atMonthCap = viewYear === cap.getFullYear() && viewMonth === cap.getMonth();

  const goNext = () => {
    if (atMonthCap) return;
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };
  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={[s.card, {backgroundColor: colors.surface}]} onPress={() => {}}>
          <View style={s.header}>
            <PressableScale style={[s.navBtn, {backgroundColor: colors.cardAlt}]} onPress={goPrev}>
              <Icon name="chevronLeft" size={16} color={colors.textPrimary} />
            </PressableScale>
            <Text style={[s.monthLabel, {color: colors.textPrimary}]}>{MONTHS[viewMonth]} {viewYear}</Text>
            <PressableScale
              style={[s.navBtn, {backgroundColor: colors.cardAlt, opacity: atMonthCap ? 0.35 : 1}]}
              disabled={atMonthCap}
              onPress={goNext}>
              <Icon name="chevronRight" size={16} color={colors.textPrimary} />
            </PressableScale>
          </View>

          <View style={s.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[s.weekTxt, {color: colors.textMuted}]}>{w}</Text>
            ))}
          </View>

          <View style={s.grid}>
            {cells.map((day, i) => {
              if (day == null) return <View key={i} style={s.cell} />;
              const key = toKey(viewYear, viewMonth, day);
              const disabled = key > capKey;
              const selected = key === value;
              const isToday = key === todayKey;
              return (
                <Pressable
                  key={i}
                  disabled={disabled}
                  onPress={() => onSelect(key)}
                  style={s.cell}>
                  <View style={[
                    s.dayDot,
                    selected && {backgroundColor: colors.primary},
                    !selected && isToday && {borderWidth: 1.5, borderColor: colors.primary},
                  ]}>
                    <Text style={[
                      s.dayTxt,
                      {color: disabled ? colors.textMuted : selected ? colors.textOnPrimary : colors.textPrimary},
                      disabled && {opacity: 0.4},
                    ]}>
                      {day}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <PressableScale
            style={[s.todayBtn, {borderColor: colors.border}]}
            onPress={() => onSelect(todayKey)}>
            <Icon name="calendar" size={14} color={colors.textSecondary} />
            <Text style={[s.todayTxt, {color: colors.textSecondary}]}>Jump to today</Text>
          </PressableScale>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24},
  card: {width: '100%', maxWidth: 360, borderRadius: 20, padding: 18},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14},
  navBtn: {width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center'},
  monthLabel: {fontSize: 16, fontWeight: '800'},
  weekRow: {flexDirection: 'row', marginBottom: 4},
  weekTxt: {flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '700'},
  grid: {flexDirection: 'row', flexWrap: 'wrap'},
  cell: {width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center'},
  dayDot: {width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center'},
  dayTxt: {fontSize: 14, fontWeight: '600'},
  todayBtn: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 14, height: 40, borderRadius: 12, borderWidth: 1},
  todayTxt: {fontSize: 13, fontWeight: '700'},
});
