import React, {createContext, useCallback, useContext, useState, useEffect, useRef} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {authApi, setAuthToken, setUnauthorizedHandler} from '../services/api';

export type UserRole = 'doctor' | 'staff' | 'valet' | 'driver' | 'admin';

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
  employeeId: string;
  department?: string;
  cardCode?: string;       // 3-digit virtual card code
  carNumber?: string;
  profileComplete?: boolean;
  loginTime?: number;
  linkedDriverId?: string; // links a driver login to its backend Driver record
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (employeeId: string, password: string) => Promise<void>;
  logout: () => void;
  updateProfile: (patch: Partial<CurrentUser>) => void;
}

const SESSION_KEY = '@kims_session';
const SESSION_HOURS = 12;

const Ctx = createContext<AuthContextValue>({
  user: null,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  updateProfile: () => {},
});

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [user, setUser]         = useState<CurrentUser | null>(null);
  const [isLoading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const logout = useCallback(() => {
    setUser(null);
    tokenRef.current = null;
    setAuthToken(null);
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
          // Validate in the background — an expired/revoked token 401s and
          // the interceptor above logs the user out automatically.
          authApi.me().catch(() => {});
        } else {
          AsyncStorage.removeItem(SESSION_KEY);
        }
      } catch {
        AsyncStorage.removeItem(SESSION_KEY);
      }
    }).finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (employeeId: string, password: string) => {
    const {token, user: loggedInUser} = await authApi.login(employeeId, password);
    const withTime: CurrentUser = {...loggedInUser, loginTime: Date.now()};
    tokenRef.current = token;
    setAuthToken(token);
    setUser(withTime);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify({user: withTime, token, loginTime: Date.now()}));
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
