import React, {useEffect, useRef, useState} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions} from 'react-native';
import {WebView} from 'react-native-webview';
import {useTheme} from '../../context/ThemeContext';
import {useAppState, ParkingTask} from '../../context/AppStateContext';
import {useAuth} from '../../context/AuthContext';
import {computeLiveProgress} from '../../utils/geo';

const {height} = Dimensions.get('window');

// KIMS Hospital Secunderabad approximate coords
const HOSPITAL = {lat: 17.4399, lng: 78.3489};

// Simulated parking route waypoints from entrance to parking block A
const PARK_ROUTE: [number, number][] = [
  [17.4399, 78.3489],  // Hospital gate
  [17.4396, 78.3492],  // Main drive
  [17.4393, 78.3496],  // Parking entrance
  [17.4391, 78.3500],  // Block A row 1
  [17.4389, 78.3503],  // Block A row 2
  [17.4387, 78.3505],  // Destination slot
];

const RETRIEVE_ROUTE: [number, number][] = [...PARK_ROUTE].reverse();

function buildMapHTML(lat: number, lng: number, routePoints: [number,number][], isDark: boolean) {
  const routeJSON = JSON.stringify(routePoints);
  const bgColor = isDark ? '#0F1829' : '#EEF2FF';
  const textColor = isDark ? '#F1F5F9' : '#0F172A';

  return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body, #map { width: 100%; height: 100%; background: ${bgColor}; }
  .leaflet-tile-pane { ${isDark ? 'filter: brightness(0.7) saturate(0.8) hue-rotate(190deg);' : ''} }
  .car-icon { font-size: 28px; line-height: 1; filter: drop-shadow(0 2px 6px rgba(0,0,0,0.4)); }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', {zoomControl: false, attributionControl: false}).setView([${lat}, ${lng}], 17);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19}).addTo(map);

  var routePoints = ${routeJSON};

  // Draw route polyline
  var routeLine = L.polyline(routePoints, {
    color: '${isDark ? '#818CF8' : '#4F46E5'}',
    weight: 5,
    opacity: 0.8,
    dashArray: '8, 6',
    lineCap: 'round',
  }).addTo(map);
  map.fitBounds(routeLine.getBounds(), {padding: [40, 40]});

  // Start marker
  L.circleMarker(routePoints[0], {
    radius: 10, color: '${isDark ? '#10B981' : '#059669'}',
    fillColor: '${isDark ? '#10B981' : '#059669'}', fillOpacity: 1, weight: 3,
  }).addTo(map).bindPopup('<b>Valet Counter</b>');

  // End marker
  L.circleMarker(routePoints[routePoints.length-1], {
    radius: 10, color: '${isDark ? '#F59E0B' : '#D97706'}',
    fillColor: '${isDark ? '#F59E0B' : '#D97706'}', fillOpacity: 1, weight: 3,
  }).addTo(map).bindPopup('<b>Parking Slot</b>');

  // Car marker — starts at the route's origin and only moves when a real
  // GPS fix arrives from React Native (no scripted/fake motion).
  var carIcon = L.divIcon({className: '', html: '<div class="car-icon">🚗</div>', iconSize: [32, 32], iconAnchor: [16, 16]});
  var carMarker = L.marker(routePoints[0], {icon: carIcon}).addTo(map);

  // Listen for real GPS location from React Native
  document.addEventListener('message', function(e) {
    try {
      var data = JSON.parse(e.data);
      if (data.type === 'realGPS') {
        carMarker.setLatLng([data.lat, data.lng]);
        map.panTo([data.lat, data.lng], {animate: true, duration: 1.0});
      }
    } catch(err) {}
  });
</script>
</body>
</html>`;
}

interface Props {
  task?: ParkingTask;
  onBack?: () => void;
}

export function LiveTrackingScreen({task: taskProp, onBack}: Props) {
  const {colors, isDark} = useTheme();
  const {user} = useAuth();
  const {tasks} = useAppState();
  const webRef = useRef<any>(null);
  const [progress, setProgress] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const sheetAnim = useRef(new Animated.Value(260)).current;

  const isDriver = user?.role === 'driver';
  const myDriverId = user?.linkedDriverId ?? user?.id;
  // Used bare (no `task` prop) from the driver's "Track" tab — resolve their
  // own active task instead of rendering an empty/unrelated screen.
  const task = taskProp ?? (isDriver ? tasks.find(t => t.driverId === myDriverId && t.status !== 'completed') : undefined);
  const routePoints = task?.type === 'retrieve' ? RETRIEVE_ROUTE : PARK_ROUTE;
  const arrived = task?.status === 'completed';
  const realLat = task?.driverLat ?? null;
  const realLng = task?.driverLng ?? null;

  // GPS collection itself is centralized in AppStateContext (one watcher for
  // the whole app, driver-only) — this screen, on any role's phone, just
  // renders whatever `task.driverLat/driverLng` the last poll delivered.
  useEffect(() => {
    if (realLat == null || realLng == null) return;
    webRef.current?.postMessage(JSON.stringify({type: 'realGPS', lat: realLat, lng: realLng}));

    const frac = computeLiveProgress(task?.driverStartLat, task?.driverStartLng, realLat, realLng) ?? 0;
    setProgress(frac);
    Animated.timing(progressAnim, {toValue: frac, duration: 400, useNativeDriver: false}).start();
  }, [realLat, realLng, task?.driverStartLat, task?.driverStartLng]);

  // Animate bottom sheet in
  useEffect(() => {
    Animated.spring(sheetAnim, {toValue: 0, useNativeDriver: true, speed: 12, bounciness: 4}).start();
  }, []);

  const progressWidth = progressAnim.interpolate({inputRange: [0, 1], outputRange: ['0%', '100%']});
  const eta = Math.max(0, Math.round((1 - progress) * 8));

  const mapHTML = buildMapHTML(HOSPITAL.lat, HOSPITAL.lng, routePoints, isDark);

  if (!task) {
    return (
      <View style={[s.root, s.emptyRoot, {backgroundColor: colors.background}]}>
        <Text style={s.emptyIcon}>🅿️</Text>
        <Text style={[s.emptyTitle, {color: colors.textPrimary}]}>No Active Task</Text>
        <Text style={[s.emptyDesc, {color: colors.textMuted}]}>Live tracking will appear here once you have an assigned task.</Text>
      </View>
    );
  }

  return (
    <View style={[s.root, {backgroundColor: colors.background}]}>
      {/* Back button overlay */}
      {onBack && (
        <TouchableOpacity style={[s.backBtn, {backgroundColor: colors.surface}]} onPress={onBack} activeOpacity={0.85}>
          <Text style={[s.backTxt, {color: colors.textPrimary}]}>←</Text>
        </TouchableOpacity>
      )}

      {/* Live badge overlay */}
      <View style={[s.liveBadge, {backgroundColor: colors.error}]}>
        <View style={s.liveDot} />
        <Text style={s.liveTxt}>LIVE</Text>
      </View>

      {/* Real GPS badge — shown once an actual fix is in hand, driver or viewer */}
      {realLat != null && (
        <View style={[s.gpsBadge, {backgroundColor: colors.success}]}>
          <Text style={s.gpsTxt}>📡 {isDriver ? 'GPS Active' : 'Live GPS'}</Text>
        </View>
      )}

      {/* Map */}
      <WebView
        ref={webRef}
        style={s.map}
        source={{html: mapHTML}}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        allowsInlineMediaPlayback
        mixedContentMode="always"
        originWhitelist={['*']}
      />

      {/* Bottom info sheet */}
      <Animated.View style={[s.sheet, {backgroundColor: colors.surface, transform: [{translateY: sheetAnim}]}]}>

        {/* Progress bar */}
        <View style={[s.progressTrack, {backgroundColor: colors.border}]}>
          <Animated.View style={[s.progressFill, {width: progressWidth, backgroundColor: arrived ? colors.success : colors.primary}]} />
        </View>

        {arrived ? (
          <View style={s.arrivedRow}>
            <Text style={s.arrivedIcon}>✅</Text>
            <View>
              <Text style={[s.arrivedTitle, {color: colors.success}]}>
                {task?.type === 'park' ? 'Car Parked Successfully!' : 'Car Retrieved!'}
              </Text>
              <Text style={[s.arrivedSub, {color: colors.textMuted}]}>
                {task?.slotId ? `Slot: ${task.slotId}` : 'Delivered to valet counter'}
              </Text>
            </View>
          </View>
        ) : (
          <>
            <View style={s.sheetHeader}>
              <View>
                <Text style={[s.sheetTitle, {color: colors.textPrimary}]}>
                  {task?.type === 'park' ? 'Parking your car' : 'Retrieving your car'}
                </Text>
                <Text style={[s.sheetSub, {color: colors.textMuted}]}>
                  {task?.carNumber ?? 'Vehicle'} · {task?.driverName ?? 'Driver en route'}
                </Text>
              </View>
              <View style={[s.etaBox, {backgroundColor: colors.primary}]}>
                <Text style={s.etaNum}>{eta}</Text>
                <Text style={s.etaUnit}>min</Text>
              </View>
            </View>

            <View style={s.stepsRow}>
              {['Key Collected', 'In Transit', task?.type === 'park' ? 'Parked ✓' : 'At Gate ✓'].map((step, i) => {
                const done = progress > i * 0.4;
                return (
                  <View key={step} style={s.step}>
                    <View style={[s.stepDot, {backgroundColor: done ? colors.success : colors.border}]}>
                      {done && <Text style={s.stepCheck}>✓</Text>}
                    </View>
                    <Text style={[s.stepLabel, {color: done ? colors.textPrimary : colors.textMuted}]} numberOfLines={1}>{step}</Text>
                    {i < 2 && <View style={[s.stepLine, {backgroundColor: done ? colors.success : colors.border}]} />}
                  </View>
                );
              })}
            </View>

            {task?.slotId && (
              <View style={[s.slotChip, {backgroundColor: colors.primary + '12', borderColor: colors.primary + '30'}]}>
                <Text style={[s.slotChipTxt, {color: colors.primary}]}>
                  {task.type === 'retrieve' ? '📍 Retrieving from' : '🅿️ Destination'}: <Text style={{fontWeight: '900'}}>{task.slotId}</Text>
                </Text>
              </View>
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {flex: 1},
  map: {flex: 1},
  emptyRoot: {alignItems: 'center', justifyContent: 'center', padding: 40, gap: 8},
  emptyIcon: {fontSize: 40, marginBottom: 8},
  emptyTitle: {fontSize: 18, fontWeight: '800'},
  emptyDesc: {fontSize: 13, textAlign: 'center', lineHeight: 19},
  backBtn: {position: 'absolute', top: 52, left: 16, zIndex: 10, width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 8, elevation: 8},
  backTxt: {fontSize: 20, fontWeight: '700'},
  liveBadge: {position: 'absolute', top: 52, right: 16, zIndex: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6},
  liveDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#fff'},
  liveTxt: {color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1},
  gpsBadge: {position: 'absolute', top: 100, right: 16, zIndex: 10, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5},
  gpsTxt: {color: '#fff', fontSize: 10, fontWeight: '700'},
  sheet: {position: 'absolute', bottom: 0, left: 0, right: 0, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32, shadowColor: '#000', shadowOffset: {width: 0, height: -4}, shadowOpacity: 0.15, shadowRadius: 16, elevation: 24},
  progressTrack: {height: 4, borderRadius: 2, marginVertical: 16, overflow: 'hidden'},
  progressFill: {height: '100%', borderRadius: 2},
  sheetHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20},
  sheetTitle: {fontSize: 17, fontWeight: '800'},
  sheetSub: {fontSize: 12, marginTop: 3},
  etaBox: {borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center'},
  etaNum: {color: '#fff', fontSize: 22, fontWeight: '900'},
  etaUnit: {color: 'rgba(255,255,255,0.75)', fontSize: 10, fontWeight: '600'},
  stepsRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 16},
  step: {flex: 1, alignItems: 'center', position: 'relative'},
  stepDot: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 6},
  stepCheck: {color: '#fff', fontSize: 12, fontWeight: '900'},
  stepLabel: {fontSize: 10, fontWeight: '700', textAlign: 'center'},
  stepLine: {position: 'absolute', top: 14, right: '-50%', width: '100%', height: 2},
  slotChip: {borderRadius: 12, borderWidth: 1, padding: 12, alignItems: 'center'},
  slotChipTxt: {fontSize: 13, fontWeight: '600'},
  arrivedRow: {flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8},
  arrivedIcon: {fontSize: 36},
  arrivedTitle: {fontSize: 17, fontWeight: '800'},
  arrivedSub: {fontSize: 12, marginTop: 4},
});
