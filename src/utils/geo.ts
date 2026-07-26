// Great-circle distance in meters.
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// A real destination isn't known ahead of time (the map's route waypoints
// are illustrative, not the actual hospital's live coordinates), so trip
// progress is measured as "distance traveled from the start anchor" against
// a nominal expected trip length rather than distance to a fixed point —
// this stays meaningful whether tested on-site or anywhere else.
const NOMINAL_TRIP_METERS = 300;

export function computeLiveProgress(
  startLat?: number | null, startLng?: number | null,
  lat?: number | null, lng?: number | null,
): number | null {
  if (startLat == null || startLng == null || lat == null || lng == null) return null;
  const traveled = haversineMeters(startLat, startLng, lat, lng);
  return Math.max(0, Math.min(1, traveled / NOMINAL_TRIP_METERS));
}
