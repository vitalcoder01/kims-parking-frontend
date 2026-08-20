// Backend base URL — flip ACTIVE_BACKEND to switch every screen + the socket
// connection (see services/socket.ts, which derives SOCKET_URL from this) at
// once. No other file should hardcode a backend URL.
//
// 'render' — the deployed production backend + production Supabase DB.
// 'dev'    — the SEPARATE Render service tracking the backend's `dev`
//   branch, pointed at a separate/test Supabase project — for testing
//   without touching real data. Only meaningful on THIS branch (`dev`);
//   main stays hardcoded to 'render' so a production build can never
//   accidentally ship pointed at the test backend. Fill in DEV_BASE_URL
//   once the dev Render service exists (see APK_RELEASE_PROCESS.txt /
//   the dev-environment discussion for how to set that up).
// 'local'  — your own computer. Since the phone usually isn't on the same
//   network as your computer, LOCAL_BASE_URL should point at a tunnel
//   (cloudflared/ngrok) fronting your local `npm run development` server,
//   not a bare LAN IP. To start one:
//     cloudflared tunnel --url http://localhost:4000
//   then paste the https://<random>.trycloudflare.com URL it prints below.
//   Quick tunnels are randomly generated per run — update LOCAL_BASE_URL
//   every time you restart cloudflared.
type Backend = 'render' | 'dev' | 'local';
const ACTIVE_BACKEND: Backend = 'dev';

const RENDER_BASE_URL = 'https://kims-parking-backend-2.onrender.com'; // production
const DEV_BASE_URL = 'https://kims-parking-backend-3.onrender.com'; // dev Render service + test Supabase DB
// This machine's LAN address. Works for emulators AND real phones on the same
// WiFi, with no tunnel and no per-device adb setup — which is why it beats
// both 10.0.2.2 (emulator-only) and a cloudflared quick tunnel (new random
// URL every restart).
//
// Already whitelisted for cleartext HTTP in
// android/app/src/main/res/xml/network_security_config.xml, alongside
// localhost / 127.0.0.1 / 10.0.2.2.
//
// If the router hands this machine a different IP later, `ip -4 addr` shows
// the current one and it must be changed in BOTH places — here and in that
// network_security_config.xml — or Android silently blocks the request.
const LOCAL_BASE_URL = 'http://192.168.1.5:4000';

// A chained ternary here trips up tsc's literal narrowing on a const
// initialized directly with one of the union's literals (flagged TS2367
// on the web app's tsc-gated build — see kims-parking-web's identical
// fix); a lookup table sidesteps it and is what web now uses too.
const BASE_URLS: Record<Backend, string> = { render: RENDER_BASE_URL, dev: DEV_BASE_URL, local: LOCAL_BASE_URL };
const ROOT_URL = BASE_URLS[ACTIVE_BACKEND];

export const API_BASE_URL = `${ROOT_URL}/api`;

// Root of the same deployment, without the /api suffix — used to build the
// public visitor tracking link sent over WhatsApp (GET /track/:id).
export const PUBLIC_BASE_URL = ROOT_URL;
