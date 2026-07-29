// Backend base URL — flip ACTIVE_BACKEND to switch every screen + the socket
// connection (see services/socket.ts, which derives SOCKET_URL from this) at
// once. No other file should hardcode a backend URL.
//
// 'render' — the deployed production backend.
// 'local'  — your own computer. Since the phone usually isn't on the same
//   network as your computer, LOCAL_BASE_URL should point at a tunnel
//   (cloudflared/ngrok) fronting your local `npm run development` server,
//   not a bare LAN IP. To start one:
//     cloudflared tunnel --url http://localhost:4000
//   then paste the https://<random>.trycloudflare.com URL it prints below.
//   Quick tunnels are randomly generated per run — update LOCAL_BASE_URL
//   every time you restart cloudflared.
const ACTIVE_BACKEND: 'render' | 'local' = 'render';

const RENDER_BASE_URL = 'https://kims-parking-backend-2.onrender.com'; // backend
const LOCAL_BASE_URL = ''; // localhost tunnel — set this before flipping ACTIVE_BACKEND to 'local'

const ROOT_URL = ACTIVE_BACKEND === 'local' ? LOCAL_BASE_URL : RENDER_BASE_URL;

export const API_BASE_URL = `${ROOT_URL}/api`;

// Root of the same deployment, without the /api suffix — used to build the
// public visitor tracking link sent over WhatsApp (GET /track/:id).
export const PUBLIC_BASE_URL = ROOT_URL;
