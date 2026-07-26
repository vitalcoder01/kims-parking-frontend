// Backend base URL — production deployment on Render.
//
// For local dev instead, temporarily swap this back to either:
//  1. USB: 'http://127.0.0.1:4000/api' with `adb reverse tcp:4000 tcp:4000`
//  2. WiFi: 'http://<this-machine's-LAN-IP>:4000/api', same network as the phone
export const API_BASE_URL = 'https://kims-parking-backend-2.onrender.com/api';
