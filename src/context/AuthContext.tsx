import React, {createContext, useCallback, useContext, useState, useEffect, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {authApi, setAuthToken, setUnauthorizedHandler, clearConditionalGetCache} from '../services/api';
import {unregisterCurrentDevice} from '../services/pushMessaging';
import {stopAssignmentAlarm} from '../services/notifications';

export type UserRole = 'doctor' | 'staff' | 'valet' | 'driver' | 'admin';

export interface CurrentUser {
  id: number;
  name: string;
  role: UserRole;
  employeeId: string;
  username: string;
  department?: string;
  cardCode?: string;       // 3-digit virtual card code
  carNumber?: string;
  carModel?: string;
  carColor?: string;
  vehicleType?: 'car' | 'bike';
  phone?: string;
  profileComplete?: boolean;
  loginTime?: number;
  linkedDriverId?: number; // links a driver login to its backend Driver record
  // The linked Driver's own live status ('available'|'busy'|'off') — sent
  // by the backend's serializeUser alongside linkedDriverId whenever this
  // account has one. Kept in sync by updateProfile() after the driver
  // toggles their own shift, same as any other profile field. Mirrors
  // kims-parking-web's identical field/fix.
  driverStatus?: 'available' | 'busy' | 'off';
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  updateProfile: (patch: Partial<CurrentUser>) => void;
}

const SESSION_KEY = '@kims_session';
const SESSION_HOURS = 12;

const Ctx = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => ({} as CurrentUser),
  logout: async () => {},
  updateProfile: () => {},
});

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser]         = useState<CurrentUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const logout = useCallback(async () => {
    // A still-ringing assignment alarm (vibration + ongoing tray
    // notification) otherwise keeps going after logout — nothing else
    // dismisses it, so it looks like logout itself is "triggering" a push.
    await stopAssignmentAlarm().catch(() => {});
    // Must run before the token is cleared below — it needs a valid
    // Authorization header to tell the backend to drop this device's
    // registration, otherwise this phone keeps receiving the signed-out
    // account's pushes until someone else logs in here. Capped so a slow/
    // unreachable network never delays the logout button itself.
    await Promise.race([
      unregisterCurrentDevice().catch(() => {}),
      new Promise<void>(resolve => setTimeout(() => resolve(), 3000)),
    ]);
    setUser(null);
    tokenRef.current = null;
    setAuthToken(null);
    clearConditionalGetCache();
    AsyncStorage.removeItem(SESSION_KEY);
  }, []);

  // Any request that comes back 401 (expired/invalid token) forces logout.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  useEffect(() => {
    AsyncStorage.getItem(SESSION_KEY).then(raw => {
      if (!raw) return;
      try {
        const saved: {user: CurrentUser; token: string; loginTime: number} = JSON.parse(raw);
        const age = (Date.now() - saved.loginTime) / (1000 * 60 * 60);
        if (age < SESSION_HOURS && saved.token) {
          tokenRef.current = saved.token;
          setAuthToken(saved.token);
          setUser(saved.user);
          // Refresh from the server in the background — an expired/revoked
          // token 401s and the interceptor above logs the user out
          // automatically; a *valid* token still needs this because an
          // admin may have changed this account's role/name/etc. since the
          // session was cached, and the stale cached role would otherwise
          // keep driving which navigator/tabs/endpoints this session uses
          // until the next full login.
          authApi.me().then(fresh => updateProfile(fresh)).catch(() => {});
        } else {
          AsyncStorage.removeItem(SESSION_KEY);
        }
      } catch {
        AsyncStorage.removeItem(SESSION_KEY);
      }
    }).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const {token, user: loggedInUser} = await authApi.login(username, password);
    const withTime: CurrentUser = {...loggedInUser, loginTime: Date.now()};
    tokenRef.current = token;
    setAuthToken(token);
    clearConditionalGetCache();
    setUser(withTime);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({user: withTime, token, loginTime: Date.now()}));
    return withTime;
  }, []);

  const updateProfile = useCallback((patch: Partial<CurrentUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = {...prev, ...patch};
      AsyncStorage.setItem(
        SESSION_KEY,
        JSON.stringify({user: updated, token: tokenRef.current, loginTime: updated.loginTime ?? Date.now()}),
      );
      return updated;
    });
  }, []);

  return (
    <Ctx.Provider value={{user, isLoading, login, logout, updateProfile}}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }
