// Backend base URL.
//
// The phone reaches the backend one of two ways:
//  1. USB (recommended for dev): `adb reverse tcp:4000 tcp:4000` tunnels the
//     phone's localhost:4000 to this PC's localhost:4000. Use 127.0.0.1 below.
//  2. WiFi: point at this machine's LAN IP instead (must be on the same
//     network as the phone), e.g. http://10.233.53.146:4000/api
//
// For a real production deployment, replace this with your deployed
// backend's HTTPS URL.
export const API_BASE_URL = 'http://127.0.0.1:4000/api';
