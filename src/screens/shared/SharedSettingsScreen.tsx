import React from 'react';
import {ScrollView, View, Text, StyleSheet, Alert} from 'react-native';
import {WebView} from 'react-native-webview';
import {PressableScale} from '../../components/PressableScale';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useTheme} from '../../context/ThemeContext';
import {useAuth} from '../../context/AuthContext';
import {ThemeToggleRow, AppSwitch} from '../../components/AppSwitch';
import {Card} from '../../components/Card';
import {Icon, IconName} from '../../components/Icon';
import {typography, spacing, radius} from '../../theme';
import {APP_VERSION_NAME, APP_VERSION_CODE} from '../../config/version';
import {adminApi} from '../../services/api';

// Tap-to-place pin — the admin drops this once on the actual parking lot;
// every park task then uses this same fixed point as its "destination"
// (there's no per-task destination to derive it from the way a retrieval
// has the doctor's live location), which is what makes the ETA/progress bar
// on the live tracking screen work for parking jobs at all.
function LocationMapPicker({lat, lng, isDark, onPick}: {lat: number; lng: number; isDark: boolean; onPick: (lat: number, lng: number) => void}) {
  const html = `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html, body, #map { width:100%; height:100%; }
  .leaflet-tile-pane { ${isDark ? 'filter: brightness(0.7) saturate(0.8) hue-rotate(190deg);' : ''} }
</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', {zoomControl: false, attributionControl: false}).setView([${lat}, ${lng}], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);
  var marker = L.marker([${lat}, ${lng}], {draggable: true}).addTo(map);
  function report(pos) {
    window.ReactNativeWebView.postMessage(JSON.stringify({lat: pos.lat, lng: pos.lng}));
  }
  marker.on('dragend', function() { report(marker.getLatLng()); });
  map.on('click', function(e) { marker.setLatLng(e.latlng); report(e.latlng); });
</script>
</body></html>`;

  return (
    <WebView
      style={{height: 220, borderRadius: 14, overflow: 'hidden'}}
      source={{html}}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={['*']}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (typeof data.lat === 'number' && typeof data.lng === 'number') onPick(data.lat, data.lng);
        } catch {}
      }}
    />
  );
}

type ThemeMode = 'light' | 'dark' | 'system';

const ROLE_LABELS: Record<string, string> = {
  doctor: 'Doctor', valet: 'Valet',
  parking_driver: 'Parking Driver', retrieval_driver: 'Retrieval Driver', admin: 'Admin',
};

const DEFAULT_LAT = 20.5937;
const DEFAULT_LNG = 78.9629;

export function SharedSettingsScreen() {
  const {colors, mode, setMode, isDark} = useTheme();
  const {user, logout} = useAuth();

  // Admin-only: driver accept window (seconds) — how long a driver has to
  // accept an assignment before the valet is prompted to reassign.
  const [acceptTimeout, setAcceptTimeout] = React.useState<number | null>(null);
  // Admin-only: the parking lot's fixed location — every park task's
  // "destination" (ETA/route on the live tracking screen) comes from this
  // single point, since (unlike a retrieval) there's no per-task location
  // to derive it from.
  const [lotPin, setLotPin] = React.useState<{lat: number; lng: number} | null>(null);
  const [savingLot, setSavingLot] = React.useState(false);
  const [lotSaved, setLotSaved] = React.useState(false);
  // Admin-only: the valet gate/entrance — a retrieval's real "destination"
  // is this fixed pickup point, not the doctor's own live GPS at the moment
  // they request the car (see task.service.js requestRetrieval).
  const [gatePin, setGatePin] = React.useState<{lat: number; lng: number} | null>(null);
  const [savingGate, setSavingGate] = React.useState(false);
  const [gateSaved, setGateSaved] = React.useState(false);

  React.useEffect(() => {
    if (user?.role !== 'admin') return;
    adminApi.getSettings()
      .then(s => {
        setAcceptTimeout(Number(s.driverAcceptTimeoutSeconds) || 60);
        const lotLat = Number(s.parkingLotLat);
        const lotLng = Number(s.parkingLotLng);
        setLotPin(Number.isFinite(lotLat) && Number.isFinite(lotLng) && s.parkingLotLat && s.parkingLotLng
          ? {lat: lotLat, lng: lotLng}
          : {lat: DEFAULT_LAT, lng: DEFAULT_LNG});
        const gateLat = Number(s.valetGateLat);
        const gateLng = Number(s.valetGateLng);
        setGatePin(Number.isFinite(gateLat) && Number.isFinite(gateLng) && s.valetGateLat && s.valetGateLng
          ? {lat: gateLat, lng: gateLng}
          : {lat: DEFAULT_LAT, lng: DEFAULT_LNG});
      })
      .catch(() => {});
  }, [user?.role]);

  const changeAcceptTimeout = (delta: number) => {
    setAcceptTimeout(prev => {
      const next = Math.min(600, Math.max(10, (prev ?? 60) + delta));
      adminApi.updateSettings({driverAcceptTimeoutSeconds: next}).catch(() => {});
      return next;
    });
  };

  const saveLotPin = async () => {
    if (!lotPin) return;
    setSavingLot(true);
    try {
      await adminApi.updateSettings({parkingLotLat: lotPin.lat, parkingLotLng: lotPin.lng});
      setLotSaved(true);
      setTimeout(() => setLotSaved(false), 2000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save parking lot location');
    } finally {
      setSavingLot(false);
    }
  };

  const saveGatePin = async () => {
    if (!gatePin) return;
    setSavingGate(true);
    try {
      await adminApi.updateSettings({valetGateLat: gatePin.lat, valetGateLng: gatePin.lng});
      setGateSaved(true);
      setTimeout(() => setGateSaved(false), 2000);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not save valet gate location');
    } finally {
      setSavingGate(false);
    }
  };

  const [notifTasks,    setNotifTasks]    = React.useState(true);
  const [notifShift,    setNotifShift]    = React.useState(true);
  const [notifUpdates,  setNotifUpdates]  = React.useState(false);
  const [biometrics,    setBiometrics]    = React.useState(true);

  const modeOptions: {value: ThemeMode; label: string; icon: IconName}[] = [
    {value: 'light', label: 'Light', icon: 'sun'},
    {value: 'dark',  label: 'Dark',  icon: 'moon'},
    {value: 'system',label: 'System',icon: 'phone'},
  ];

  const initials = user?.name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2) ?? '??';

  return (
    <SafeAreaView edges={['bottom','left','right']} style={[styles.safe, {backgroundColor: colors.background}]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile */}
        <Card style={styles.profileCard}>
          <View style={[styles.avatar, {backgroundColor: colors.primary + '22', borderColor: colors.primary + '44'}]}>
            <Text style={[styles.avatarText, {color: colors.primary}]}>{initials}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, {color: colors.textPrimary}]}>{user?.name ?? '—'}</Text>
            <Text style={[styles.profileRole, {color: colors.textSecondary}]}>
              {user ? ROLE_LABELS[user.role] : '—'}
              {user?.department ? ` · ${user.department}` : ''}
            </Text>
            <Text style={[styles.profileId, {color: colors.primary}]}>{user?.employeeId ?? '—'}</Text>
          </View>
        </Card>

        {/* Appearance */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>APPEARANCE</Text>
        <ThemeToggleRow />
        <Card>
          <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Theme Mode</Text>
          <View style={styles.modeRow}>
            {modeOptions.map(opt => {
              const isActive = mode === opt.value;
              return (
                <PressableScale
                  key={opt.value}
                  onPress={() => setMode(opt.value)}
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: isActive ? colors.primaryLight : colors.cardAlt,
                      borderColor: isActive ? colors.primary : colors.border,
                    },
                  ]}>
                  <Icon name={opt.icon} size={20} color={isActive ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.modeLabel, {color: isActive ? colors.primary : colors.textSecondary}]}>
                    {opt.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Card>

        {/* Operations (admin only) */}
        {user?.role === 'admin' && acceptTimeout != null && (
          <>
            <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>OPERATIONS</Text>
            <Card>
              <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Driver Accept Timeout</Text>
              <View style={styles.stepperRow}>
                <PressableScale
                  onPress={() => changeAcceptTimeout(-10)}
                  style={[styles.stepperBtn, {backgroundColor: colors.cardAlt, borderColor: colors.border}]}>
                  <Text style={[styles.stepperBtnTxt, {color: colors.textPrimary}]}>−10s</Text>
                </PressableScale>
                <Text style={[styles.stepperValue, {color: colors.textPrimary}]}>{acceptTimeout}s</Text>
                <PressableScale
                  onPress={() => changeAcceptTimeout(10)}
                  style={[styles.stepperBtn, {backgroundColor: colors.cardAlt, borderColor: colors.border}]}>
                  <Text style={[styles.stepperBtnTxt, {color: colors.textPrimary}]}>+10s</Text>
                </PressableScale>
              </View>
              <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>
                If a driver doesn't accept a job within this window, the valet is alerted and asked to reassign.
              </Text>
            </Card>

            <Card>
              <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Parking Lot Location</Text>
              <Text style={[styles.infoLabel, {color: colors.textSecondary, marginBottom: spacing.sm}]}>
                Tap the map (or drag the pin) to set where the parking lot actually is — this is what powers the ETA and live route on parking jobs.
              </Text>
              {lotPin && (
                <LocationMapPicker
                  lat={lotPin.lat}
                  lng={lotPin.lng}
                  isDark={isDark}
                  onPick={(lat, lng) => { setLotPin({lat, lng}); setLotSaved(false); }}
                />
              )}
              <PressableScale
                onPress={saveLotPin}
                disabled={savingLot}
                style={[styles.stepperBtn, {marginTop: spacing.sm, alignSelf: 'flex-start', backgroundColor: lotSaved ? colors.successLight : colors.primary, borderColor: 'transparent', opacity: savingLot ? 0.6 : 1}]}>
                <Text style={[styles.stepperBtnTxt, {color: lotSaved ? colors.success : colors.textOnPrimary}]}>
                  {savingLot ? 'Saving…' : lotSaved ? 'Saved ✓' : 'Save Location'}
                </Text>
              </PressableScale>
            </Card>

            <Card>
              <Text style={[styles.cardTitle, {color: colors.textSecondary}]}>Valet Gate / Pickup Point</Text>
              <Text style={[styles.infoLabel, {color: colors.textSecondary, marginBottom: spacing.sm}]}>
                Where a retrieved car is actually handed back to the doctor — this is what powers the ETA and live route on retrieval jobs, instead of the doctor's own phone GPS.
              </Text>
              {gatePin && (
                <LocationMapPicker
                  lat={gatePin.lat}
                  lng={gatePin.lng}
                  isDark={isDark}
                  onPick={(lat, lng) => { setGatePin({lat, lng}); setGateSaved(false); }}
                />
              )}
              <PressableScale
                onPress={saveGatePin}
                disabled={savingGate}
                style={[styles.stepperBtn, {marginTop: spacing.sm, alignSelf: 'flex-start', backgroundColor: gateSaved ? colors.successLight : colors.primary, borderColor: 'transparent', opacity: savingGate ? 0.6 : 1}]}>
                <Text style={[styles.stepperBtnTxt, {color: gateSaved ? colors.success : colors.textOnPrimary}]}>
                  {savingGate ? 'Saving…' : gateSaved ? 'Saved ✓' : 'Save Location'}
                </Text>
              </PressableScale>
            </Card>
          </>
        )}

        {/* Notifications */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>NOTIFICATIONS</Text>
        <Card>
          <AppSwitch
            label="Task Assignments"
            description="When a new task is assigned to you"
            value={notifTasks}
            onValueChange={setNotifTasks}
          />
          <View style={[styles.divider, {backgroundColor: colors.divider}]} />
          <AppSwitch
            label="Shift Reminders"
            description="Start and end of shift alerts"
            value={notifShift}
            onValueChange={setNotifShift}
          />
          <View style={[styles.divider, {backgroundColor: colors.divider}]} />
          <AppSwitch
            label="App Updates"
            description="New features and announcements"
            value={notifUpdates}
            onValueChange={setNotifUpdates}
          />
        </Card>

        {/* Security */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>SECURITY</Text>
        <Card>
          <AppSwitch
            label="Biometric Login"
            description="Use fingerprint or Face ID"
            value={biometrics}
            onValueChange={setBiometrics}
          />
        </Card>

        {/* About */}
        <Text style={[styles.sectionTitle, {color: colors.textMuted}]}>ABOUT</Text>
        <Card>
          {[
            ['App Version', `${APP_VERSION_NAME} (${APP_VERSION_CODE})`],
            ['Build', 'Release'],
            ['Hospital', 'KIMS Hospitals'],
          ].map(([label, value]) => (
            <View
              key={label}
              style={[styles.infoRow, {borderBottomColor: colors.divider}]}>
              <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{label}</Text>
              <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{value}</Text>
            </View>
          ))}
        </Card>

        {/* Logout */}
        <PressableScale
          onPress={() =>
            Alert.alert('Logout', 'Are you sure you want to logout?', [
              {text: 'Cancel', style: 'cancel'},
              {text: 'Logout', style: 'destructive', onPress: logout},
            ])
          }
          style={[styles.logoutBtn, {backgroundColor: colors.errorLight, borderColor: colors.error + '44'}]}>
          <Text style={[styles.logoutText, {color: colors.error}]}>Logout</Text>
        </PressableScale>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {flex: 1},
  scroll: {padding: spacing.base, paddingBottom: spacing['3xl']},

  profileCard: {flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md},
  avatar: {width: 54, height: 54, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  avatarText: {fontSize: typography.sizes.lg, fontWeight: typography.weights.black},
  profileInfo: {flex: 1},
  profileName: {fontSize: typography.sizes.md, fontWeight: typography.weights.black, letterSpacing: -0.3},
  profileRole: {fontSize: typography.sizes.sm, marginTop: 2},
  profileId: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, marginTop: 3},

  sectionTitle: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginTop: spacing.md,
  },

  cardTitle: {
    fontSize: typography.sizes.xs, fontWeight: typography.weights.bold,
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm,
  },
  modeRow: {flexDirection: 'row', gap: spacing.sm},
  modeChip: {
    flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1.5, alignItems: 'center', gap: 4,
  },
  modeLabel: {fontSize: typography.sizes.xs, fontWeight: typography.weights.bold, textTransform: 'uppercase', letterSpacing: 0.5},


  divider: {height: 1, marginVertical: spacing.xs},

  stepperRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm},
  stepperBtn: {borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: spacing.base, paddingVertical: spacing.sm},
  stepperBtnTxt: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},
  stepperValue: {fontSize: typography.sizes.lg, fontWeight: typography.weights.black},

  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderBottomWidth: 1,
  },
  infoLabel: {fontSize: typography.sizes.sm},
  infoValue: {fontSize: typography.sizes.sm, fontWeight: typography.weights.bold},

  logoutBtn: {
    borderRadius: radius.lg, borderWidth: 1,
    paddingVertical: spacing.base, alignItems: 'center', marginTop: spacing.sm,
  },
  logoutText: {fontSize: typography.sizes.base, fontWeight: typography.weights.black},
});
