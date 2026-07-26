import {Platform, PermissionsAndroid} from 'react-native';
import Geolocation from 'react-native-geolocation-service';

// Best-effort current fix — used any time a screen needs to capture "where
// is this phone right now" as a real destination/anchor point (valet's
// counter for a park trip's return leg, doctor's own position for a
// retrieval). Resolves null on denied permission or timeout rather than
// throwing, since every caller has a sane fallback for "no GPS available".
export async function getCurrentPositionSafe(): Promise<{lat: number; lng: number} | null> {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {title: 'Location Permission', message: 'KIMS Parking needs your location to guide the driver back to you.', buttonPositive: 'Allow'},
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) return null;
  }
  return new Promise(resolve => {
    Geolocation.getCurrentPosition(
      pos => resolve({lat: pos.coords.latitude, lng: pos.coords.longitude}),
      () => resolve(null),
      {enableHighAccuracy: true, timeout: 8000, maximumAge: 10000},
    );
  });
}
