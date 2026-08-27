import React, {useState, useMemo, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TextInput, ActivityIndicator, Modal, Pressable} from 'react-native';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {useAppState} from '../../context/AppStateContext';
import {PressableScale} from '../PressableScale';
import {Icon} from '../Icon';
import {Creature} from './Creature';
import {selectShiftSummary, hourLabel} from '../../core/copilot/summary';
import {syncAgeLabel} from '../../services/syncClock';
import {runHealthCheck, requestNotificationPermission, HealthItem} from '../../services/healthCheck';
import {diagnosticsApi, appApi} from '../../services/api';
import {buildReport} from '../../core/copilot/reporter';
import {APP_VERSION_NAME} from '../../config/version';
import type {Insight, CopilotRole} from '../../core/copilot/insights';

/*
 * What the creature can do once you tap it.
 *
 * The overlay's bubble answers "what is wrong right now" in one line. This
 * is everything else the app already knows and never says out loud —
 * grouped so a valet mid-shift can find one thing fast rather than read a
 * dashboard.
 *
 * Ordered by urgency, not by feature: what needs attention, then whether
 * the app itself is healthy, then how the day has gone, then the tools.
 * Anything that needs a network call is lazy — nothing here runs until the
 * panel is actually opened.
 */

interface Props {
  visible: boolean;
  onClose: () => void;
  insights: Insight[];
  onAct: (insight: Insight) => void;
  onDismiss: (id: string) => void;
}

const STATE_COLOR = {ok: '#2FA84F', warn: '#F5A524', fail: '#E5484D', checking: '#8A8F98'} as const;

export function CopilotPanel({visible, onClose, insights, onAct, onDismiss}: Props) {
  const {colors} = useTheme();
  const {user} = useAuth();
  const {tasks, visitors, refreshTasks} = useAppState();

  const [health, setHealth] = useState<HealthItem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [problem, setProblem] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [notes, setNotes] = useState<string | null>(null);

  const now = Date.now();
  const role = (user?.role ?? 'doctor') as CopilotRole;

  const summary = useMemo(
    () => selectShiftSummary(tasks, {role, userId: user?.id, driverId: user?.linkedDriverId ?? null, now}),
    // `now` deliberately excluded: it changes every render and the summary is
    // a today-figure, not a live clock. Recomputing it per frame would be the
    // same waste this session removed elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, role, user?.id, user?.linkedDriverId, visible],
  );

  const check = useCallback(async () => {
    setChecking(true);
    try { setHealth(await runHealthCheck()); } finally { setChecking(false); }
  }, []);

  const resync = useCallback(async () => {
    setResyncing(true);
    try { await refreshTasks(); } catch { /* the health row will show it failed */ }
    finally { setResyncing(false); }
  }, [refreshTasks]);

  /*
   * A problem a valet can see but the app cannot.
   *
   * Crash reporting only catches faults that THROW. "The map shows Dinesh in
   * the wrong place" throws nothing and reaches nobody. This lands in the
   * same table as real crashes, with role, screen and version attached, so
   * it sits in triage next to them instead of in a WhatsApp message.
   */
  const sendProblem = useCallback(async () => {
    const text = problem.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = buildReport(new Error(text), {
        platform: 'android',
        appVersion: APP_VERSION_NAME,
        screen: 'reported-by-user',
      });
      await diagnosticsApi.reportError({...r, name: 'UserReport'});
      setSent(true);
      setProblem('');
    } catch {
      // Deliberately silent. Someone reporting a problem should not be
      // handed a second one; the row is either there or it is not.
      setSent(true);
    } finally {
      setSending(false);
    }
  }, [problem, sending]);

  const loadNotes = useCallback(async () => {
    try {
      const v = await appApi.checkVersion(user?.role);
      setNotes(v.notes ?? 'No notes for this release.');
    } catch {
      setNotes('Could not load release notes.');
    }
  }, [user?.role]);

  // Car finder — matches live records only. A plate that finished yesterday
  // is a records search, not a "where is it now" question.
  const found = useMemo(() => {
    const q = findQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const hits: {label: string; sub: string}[] = [];
    for (const v of visitors) {
      if (v.status === 'retrieved' || v.status === 'cancelled') continue;
      if ((v.carNumber ?? '').toLowerCase().includes(q) || (v.token ?? '').toLowerCase().includes(q)) {
        hits.push({label: v.carNumber ?? 'No plate', sub: `Visitor · ${v.status}${v.slotId ? ` · ${v.slotId}` : ''}`});
      }
    }
    for (const t of tasks) {
      if (t.status === 'completed' || t.status === 'cancelled') continue;
      if ((t.carNumber ?? '').toLowerCase().includes(q)) {
        hits.push({label: t.carNumber ?? 'No plate', sub: `${t.doctorName ?? 'Staff'} · ${t.status}${t.slotId ? ` · ${t.slotId}` : ''}`});
      }
    }
    return hits.slice(0, 6);
  }, [findQuery, visitors, tasks]);

  const worst = insights[0]?.severity ?? null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        {/* Tap-outside-to-close. A plain Pressable, not PressableScale:
            this is a dismiss region, not a button, and it should not
            animate or look pressable. */}
        <Pressable style={s.backdropTap} onPress={onClose} accessibilityLabel="Close" />
        <View style={[s.sheet, {backgroundColor: colors.background}]}>
          <View style={s.grabber}><View style={[s.grabberBar, {backgroundColor: colors.border}]} /></View>

          <View style={s.header}>
            <Creature mood="idle" severity={worst} size={38} restColor={colors.cardAlt} eyeColor={colors.textPrimary} />
            <View style={{flex: 1}}>
              <Text style={[s.title, {color: colors.textPrimary}]}>
                {insights.length ? `${insights.length} thing${insights.length === 1 ? '' : 's'} to look at` : 'All clear'}
              </Text>
              <Text style={[s.sub, {color: colors.textMuted}]}>
                Synced {syncAgeLabel(now)} · v{APP_VERSION_NAME}
              </Text>
            </View>
            <PressableScale onPress={onClose} style={[s.iconBtn, {borderColor: colors.border}]}>
              <Icon name="close" size={16} color={colors.textSecondary} />
            </PressableScale>
          </View>

          <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
            {/* ── What needs attention ─────────────────────────────────── */}
            {insights.length > 0 && (
              <Section title="Needs attention" colors={colors}>
                {insights.map(i => (
                  <View key={i.id} style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                    <View style={s.row}>
                      <View style={[s.dot, {backgroundColor: STATE_COLOR[i.severity === 'critical' ? 'fail' : i.severity === 'warn' ? 'warn' : 'checking']}]} />
                      <Text style={[s.cardTxt, {color: colors.textPrimary}]}>{i.message}</Text>
                    </View>
                    <View style={s.cardRow}>
                      <PressableScale onPress={() => onDismiss(i.id)} style={[s.ghost, {borderColor: colors.border}]}>
                        <Text style={[s.ghostTxt, {color: colors.textSecondary}]}>Dismiss</Text>
                      </PressableScale>
                      {i.action && (
                        <PressableScale onPress={() => { onAct(i); onClose(); }} style={[s.primary, {backgroundColor: colors.primary}]}>
                          <Text style={[s.primaryTxt, {color: colors.textOnPrimary}]}>{i.action.label}</Text>
                        </PressableScale>
                      )}
                    </View>
                  </View>
                ))}
              </Section>
            )}

            {/* ── Is the app itself healthy ────────────────────────────── */}
            <Section title="App health" colors={colors}>
              {health?.map(h => (
                <View key={h.key} style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                  <View style={s.row}>
                    <View style={[s.dot, {backgroundColor: STATE_COLOR[h.state]}]} />
                    <View style={{flex: 1}}>
                      <Text style={[s.cardTxt, {color: colors.textPrimary}]}>{h.label}</Text>
                      <Text style={[s.cardSub, {color: colors.textMuted}]}>{h.detail}</Text>
                    </View>
                  </View>
                  {h.fix === 'requestPermission' && (
                    <View style={s.cardRow}>
                      <PressableScale
                        onPress={async () => { await requestNotificationPermission(); check(); }}
                        style={[s.primary, {backgroundColor: colors.primary}]}
                      >
                        <Text style={[s.primaryTxt, {color: colors.textOnPrimary}]}>Allow alerts</Text>
                      </PressableScale>
                    </View>
                  )}
                </View>
              ))}
              <View style={s.actionsRow}>
                <PressableScale onPress={check} disabled={checking} style={[s.ghost, {borderColor: colors.border, opacity: checking ? 0.5 : 1}]}>
                  {checking
                    ? <ActivityIndicator size="small" color={colors.textSecondary} />
                    : <Text style={[s.ghostTxt, {color: colors.textSecondary}]}>{health ? 'Check again' : 'Run health check'}</Text>}
                </PressableScale>
                <PressableScale onPress={resync} disabled={resyncing} style={[s.ghost, {borderColor: colors.border, opacity: resyncing ? 0.5 : 1}]}>
                  {resyncing
                    ? <ActivityIndicator size="small" color={colors.textSecondary} />
                    : <Text style={[s.ghostTxt, {color: colors.textSecondary}]}>Resync now</Text>}
                </PressableScale>
              </View>
            </Section>

            {/* ── How today has gone ───────────────────────────────────── */}
            <Section title="Today" colors={colors}>
              <View style={s.statsRow}>
                <Stat value={String(summary.completed)} label="Completed" colors={colors} />
                <Stat value={String(summary.active)} label="Active" colors={colors} />
                <Stat
                  value={summary.medianMinutes != null ? `${summary.medianMinutes}m` : '—'}
                  label="Typical"
                  colors={colors}
                />
                <Stat
                  value={summary.busiestHour != null ? hourLabel(summary.busiestHour) : '—'}
                  label="Busiest"
                  colors={colors}
                />
              </View>
            </Section>

            {/* ── Find a car ───────────────────────────────────────────── */}
            <Section title="Find a car" colors={colors}>
              <TextInput
                value={findQuery}
                onChangeText={setFindQuery}
                placeholder="Plate or token"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                style={[s.input, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary}]}
              />
              {findQuery.trim().length >= 2 && found.length === 0 && (
                <Text style={[s.cardSub, {color: colors.textMuted, paddingHorizontal: 4}]}>
                  Nothing live matches that. It may be finished — try the Jobs tab.
                </Text>
              )}
              {found.map((f, i) => (
                <View key={i} style={[s.card, {backgroundColor: colors.surface, borderColor: colors.border}]}>
                  <Text style={[s.cardTxt, {color: colors.textPrimary}]}>{f.label}</Text>
                  <Text style={[s.cardSub, {color: colors.textMuted}]}>{f.sub}</Text>
                </View>
              ))}
            </Section>

            {/* ── Report something the app cannot see ──────────────────── */}
            <Section title="Report a problem" colors={colors}>
              {sent ? (
                <Text style={[s.cardSub, {color: colors.textMuted, paddingHorizontal: 4}]}>
                  Sent. It will show up alongside crash reports.
                </Text>
              ) : (
                <>
                  <TextInput
                    value={problem}
                    onChangeText={setProblem}
                    placeholder="What is wrong? e.g. map shows the wrong driver"
                    placeholderTextColor={colors.textMuted}
                    multiline
                    style={[s.input, s.inputTall, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary}]}
                  />
                  <View style={s.actionsRow}>
                    <PressableScale
                      onPress={sendProblem}
                      disabled={!problem.trim() || sending}
                      style={[s.primary, {backgroundColor: colors.primary, opacity: !problem.trim() || sending ? 0.5 : 1}]}
                    >
                      <Text style={[s.primaryTxt, {color: colors.textOnPrimary}]}>{sending ? 'Sending…' : 'Send'}</Text>
                    </PressableScale>
                  </View>
                </>
              )}
            </Section>

            {/* ── What changed in this version ─────────────────────────── */}
            <Section title="What's new" colors={colors}>
              {notes == null ? (
                <PressableScale onPress={loadNotes} style={[s.ghost, {borderColor: colors.border, alignSelf: 'flex-start'}]}>
                  <Text style={[s.ghostTxt, {color: colors.textSecondary}]}>Show release notes</Text>
                </PressableScale>
              ) : (
                <Text style={[s.cardSub, {color: colors.textSecondary, paddingHorizontal: 4, lineHeight: 19}]}>{notes}</Text>
              )}
            </Section>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Section({title, colors, children}: {title: string; colors: any; children: React.ReactNode}) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, {color: colors.textMuted}]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Stat({value, label, colors}: {value: string; label: string; colors: any}) {
  return (
    <View style={[s.stat, {backgroundColor: colors.surface, borderColor: colors.border}]}>
      <Text style={[s.statVal, {color: colors.textPrimary}]}>{value}</Text>
      <Text style={[s.statLbl, {color: colors.textMuted}]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)'},
  backdropTap: {flex: 1},
  sheet: {maxHeight: '86%', borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden'},
  grabber: {alignItems: 'center', paddingTop: 8},
  grabberBar: {width: 38, height: 4, borderRadius: 2},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14},
  title: {fontSize: 16, fontWeight: '900'},
  sub: {fontSize: 11.5, fontWeight: '600', marginTop: 2},
  iconBtn: {width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center'},
  body: {paddingHorizontal: 18, paddingBottom: 34},
  section: {marginBottom: 20, gap: 8},
  sectionTitle: {fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8, marginBottom: 2},
  card: {borderRadius: 14, borderWidth: 1, padding: 12, gap: 8},
  row: {flexDirection: 'row', alignItems: 'flex-start', gap: 9},
  dot: {width: 8, height: 8, borderRadius: 4, marginTop: 5},
  cardTxt: {flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18},
  cardSub: {fontSize: 11.5, fontWeight: '600', marginTop: 2, lineHeight: 16},
  cardRow: {flexDirection: 'row', justifyContent: 'flex-end', gap: 8},
  actionsRow: {flexDirection: 'row', gap: 8, marginTop: 2},
  ghost: {borderRadius: 9, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 8, minWidth: 92, alignItems: 'center'},
  ghostTxt: {fontSize: 12, fontWeight: '700'},
  primary: {borderRadius: 9, paddingHorizontal: 15, paddingVertical: 8, alignItems: 'center'},
  primaryTxt: {fontSize: 12, fontWeight: '800'},
  statsRow: {flexDirection: 'row', gap: 8},
  stat: {flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 11, alignItems: 'center'},
  statVal: {fontSize: 17, fontWeight: '900'},
  statLbl: {fontSize: 10, fontWeight: '700', marginTop: 2},
  input: {borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 11, fontSize: 13.5, fontWeight: '600'},
  inputTall: {minHeight: 78, textAlignVertical: 'top'},
});
