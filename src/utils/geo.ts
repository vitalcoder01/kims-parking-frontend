// Great-circle distance in meters.
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Realistic assumed speeds — used only to turn a real distance into an ETA;
// the distance itself is always real (either to a real destination, or
// covered-so-far), never a guessed total.
const WALK_SPEED_MPS = 1.3;   // ~4.7 km/h, brisk walk — retrieve trips (on foot to the gate)
const DRIVE_SPEED_MPS = 3.5;  // ~12.6 km/h, slow parking-lot driving — park trips

// Fallback when no real destination is on record for this task (e.g. a park
// trip, where the destination slot's GPS isn't known) — a rough "how far
// have you come" heuristic against a nominal expected trip length, so the
// UI still shows *something* moving instead of nothing.
const NOMINAL_TRIP_METERS = 300;

export interface TripEstimate {
  progress: number; // 0..1
  etaMinutes: number;
  distanceRemainingM: number | null; // null when only the nominal fallback applies
}

export function computeTrip(opts: {
  startLat?: number | null; startLng?: number | null;
  lat?: number | null; lng?: number | null;
  destinationLat?: number | null; destinationLng?: number | null;
  mode: 'walk' | 'drive';
}): TripEstimate | null {
  const {startLat, startLng, lat, lng, destinationLat, destinationLng, mode} = opts;
  if (lat == null || lng == null) return null;

  const speed = mode === 'walk' ? WALK_SPEED_MPS : DRIVE_SPEED_MPS;

  if (destinationLat != null && destinationLng != null) {
    // Real destination known (e.g. the valet's own location when they
    // requested a retrieval) — measure actual remaining distance to it.
    const remaining = haversineMeters(lat, lng, destinationLat, destinationLng);
    const total = (startLat != null && startLng != null)
      ? haversineMeters(startLat, startLng, destinationLat, destinationLng)
      : remaining;
    const progress = total > 5
      ? Math.max(0, Math.min(1, 1 - remaining / total))
      : (remaining < 15 ? 1 : 0);
    const etaMinutes = Math.max(0, Math.round(remaining / speed / 60));
    return {progress, etaMinutes, distanceRemainingM: Math.round(remaining)};
  }

  if (startLat == null || startLng == null) return null;
  const traveled = haversineMeters(startLat, startLng, lat, lng);
  const progress = Math.max(0, Math.min(1, traveled / NOMINAL_TRIP_METERS));
  const remaining = Math.max(0, NOMINAL_TRIP_METERS - traveled);
  const etaMinutes = Math.max(0, Math.round(remaining / speed / 60));
  return {progress, etaMinutes, distanceRemainingM: null};
}
