import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, StyleSheet, ScrollView, StatusBar} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {WebView} from 'react-native-webview';
import {useTheme} from '../../context/ThemeContext';
import {useAppState} from '../../context/AppStateContext';
import {Icon} from '../../components/Icon';
import {PressableScale} from '../../components/PressableScale';
import {ParkingMapScreen} from '../ParkingMapScreen';
import {LEAFLET_MAP_HTML} from '../../components/leafletMapHtml';

export function ValetMapScreen() {
  const {colors, isDark} = useTheme();
  const {drivers, tasks, driverLocations, onlineDriverIds} = useAppState();
  const [tab, setTab] = useState<'layout' | 'live'>('layout');
  const webviewRef = useRef<any>(null);
  const fittedOnce = useRef(false);

  // Live positions stream in over the socket (driver:location) for every
  // connected driver — idle or on a job. Presence removes a driver the
  // moment their app dies, so a marker on this map is always a phone that
  // is actually reachable right now.
  const liveDrivers = useMemo(() => {
    return Object.values(driverLocations)
      .filter(loc => onlineDriverIds.includes(loc.driverId))
      .map(loc => {
        const activeTask = tasks.find(t => t.driverId === loc.driverId && t.status !== 'completed' && t.status !== 'requested');
        return {
          id: loc.driverId,
          name: loc.name ?? drivers.find(d => d.id === loc.driverId)?.name ?? 'Driver',
          lat: loc.lat,
          lng: loc.lng,
          job: activeTask
            ? `${activeTask.type === 'park' ? 'Parking' : 'Retrieving'} ${activeTask.carNumber}${activeTask.slotId ? ` · ${activeTask.slotId}` : ''}`
            : 'Idle · on shift',
          onJob: !!activeTask,
        };
      });
  }, [driverLocations, onlineDriverIds, tasks, drivers]);

  // Push updated marker positions into the Leaflet map on every socket
  // delta — the WebView keeps its own Leaflet map instance alive and just
  // repositions/adds/removes markers, it never reloads the page.
  useEffect(() => {
    if (tab !== 'live') return;
    const shouldFit = !fittedOnce.current && liveDrivers.length > 0;
    if (shouldFit) fittedOnce.current = true;
    webviewRef.current?.injectJavaScript(
      `window.updateMarkers(${JSON.stringify(liveDrivers)}, ${shouldFit}); true;`,
    );
  }, [liveDrivers, tab]);

  const busyDrivers = drivers.filter(d => d.status === 'busy');

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={[s.safe, {backgroundColor: colors.background}]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />

      {/* Top tab switcher */}
      <View style={[s.tabBar, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
        <PressableScale style={s.tabItem} onPress={() => setTab('layout')}>
          <Text style={[s.tabLabel, {color: tab === 'layout' ? colors.textPrimary : colors.textMuted}]}>Parking Layout</Text>
          {tab === 'layout' && <View style={[s.tabUnderline, {backgroundColor: colors.textPrimary}]} />}
        </PressableScale>
        <PressableScale style={s.tabItem} onPress={() => setTab('live')}>
          <View style={s.tabLabelRow}>
            <Text style={[s.tabLabel, {color: tab === 'live' ? colors.textPrimary : colors.textMuted}]}>Live Map</Text>
            {liveDrivers.length > 0 && <View style={[s.tabDot, {backgroundColor: colors.success}]} />}
          </View>
          {tab === 'live' && <View style={[s.tabUnderline, {backgroundColor: colors.textPrimary}]} />}
        </PressableScale>
      </View>

      {tab === 'layout' ? (
        <ParkingMapScreen />
      ) : (
        <ScrollView contentContainerStyle={s.liveScroll} showsVerticalScrollIndicator={false}>
          {/* Leaflet + OpenStreetMap card — free, no API key, markers driven
              purely by socket deltas via injectJavaScript (never a page reload) */}
          <View style={[s.mapCard, {borderColor: colors.textPrimary}]}>
            <WebView
              ref={webviewRef}
              style={s.map}
              originWhitelist={['*']}
              source={{html: LEAFLET_MAP_HTML}}
              javaScriptEnabled
              domStorageEnabled
              onLoadEnd={() => {
                const shouldFit = !fittedOnce.current && liveDrivers.length > 0;
                if (shouldFit) fittedOnce.current = true;
                webviewRef.current?.injectJavaScript(
                  `window.updateMarkers(${JSON.stringify(liveDrivers)}, ${shouldFit}); true;`,
                );
              }}
            />
            <View style={[s.liveBadge, {backgroundColor: colors.error}]}>
              <View style={s.liveBadgeDot} />
              <Text style={s.liveBadgeTxt}>LIVE</Text>
            </View>
          </View>

          {/* Drivers currently reachable */}
          <Text style={[s.sectionTitle, {color: colors.textPrimary}]}>On the map ({liveDrivers.length})</Text>
          {liveDrivers.length === 0 ? (
            <View style={[s.emptyBox, {borderColor: colors.border}]}>
              <Icon name="navigate" size={26} color={colors.textMuted} style={{marginBottom: 8}} />
              <Text style={[s.emptyTxt, {color: colors.textMuted}]}>
                No drivers reachable right now.{'\n'}They appear the moment their app connects and shares GPS.
              </Text>
            </View>
          ) : liveDrivers.map(d => (
            <View key={d.id} style={[s.driverRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.driverAvatar, {backgroundColor: colors.primary}]}>
                <Text style={[s.driverAvatarTxt, {color: colors.textOnPrimary}]}>{d.name[0]}</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={[s.driverName, {color: colors.textPrimary}]}>{d.name}</Text>
                <Text style={[s.driverJob, {color: colors.textSecondary}]}>{d.job}</Text>
              </View>
              <View style={[s.liveDot, {backgroundColor: colors.success}]} />
            </View>
          ))}

          {/* Busy but not on the map — assigned yet no GPS/socket reaching us */}
          {busyDrivers.filter(d => !liveDrivers.some(ld => ld.id === d.id)).map(d => (
            <View key={d.id} style={[s.driverRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
              <View style={[s.driverAvatar, {backgroundColor: colors.cardAlt}]}>
                <Text style={[s.driverAvatarTxt, {color: colors.textSecondary}]}>{d.name[0]}</Text>
              </View>
              <View style={{flex: 1}}>
                <Text style={[s.driverName, {color: colors.textPrimary}]}>{d.name}</Text>
                <Text style={[s.driverJob, {color: colors.textMuted}]}>On task · waiting for GPS</Text>
              </View>
              <View style={[s.liveDot, {backgroundColor: colors.warning}]} />
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: {flex: 1},

  tabBar: {flexDirection: 'row', borderBottomWidth: 1},
  tabItem: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16},
  tabLabelRow: {flexDirection: 'row', alignItems: 'center', gap: 6},
  tabLabel: {fontSize: 15, fontWeight: '700'},
  tabDot: {width: 6, height: 6, borderRadius: 3},
  tabUnderline: {position: 'absolute', bottom: 0, left: 16, right: 16, height: 2, borderRadius: 1},

  liveScroll: {padding: 16, paddingBottom: 40},
  mapCard: {
    height: 320, borderRadius: 20, borderWidth: 2, overflow: 'hidden', marginBottom: 20,
    shadowColor: '#000', shadowOffset: {width: 0, height: 6}, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
  },
  map: {flex: 1},
  liveBadge: {position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5},
  liveBadgeDot: {width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff'},
  liveBadgeTxt: {color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1},

  sectionTitle: {fontSize: 15, fontWeight: '800', marginBottom: 12},
  emptyBox: {borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 24, alignItems: 'center'},
  emptyTxt: {fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 19},

  driverRow: {flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10},
  driverAvatar: {width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center'},
  driverAvatarTxt: {fontSize: 16, fontWeight: '800'},
  driverName: {fontSize: 14, fontWeight: '800'},
  driverJob: {fontSize: 12, fontWeight: '600', marginTop: 2},
  liveDot: {width: 8, height: 8, borderRadius: 4},
});
