import { create } from 'zustand';
import { clearSession, getStoredToken, getStoredUser, saveSession } from './auth-storage';
import { localLogin, registerDeviceToken } from './api';
import { getExpoPushToken } from './notifications';
import type { AuthUser } from '@/types/auth';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHydrated: boolean;
  theme: 'light' | 'dark';
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark') => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isHydrated: false,
  theme: 'light',

  hydrate: async () => {
    const [token, user] = await Promise.all([getStoredToken(), getStoredUser()]);
    set({
      token,
      user,
      isAuthenticated: !!token,
      isHydrated: true,
    });
  },

  login: async (email, password) => {
    const { token, user } = await localLogin(email, password);
    await saveSession(token, user);
    set({ token, user, isAuthenticated: true });

    try {
      const pushToken = await getExpoPushToken();
      if (pushToken) {
        await registerDeviceToken(pushToken);
      }
    } catch {
      // Push registration is best-effort and should not block login.
    }
  },

  logout: async () => {
    await clearSession();
    set({ token: null, user: null, isAuthenticated: false });
  },

  setTheme: (theme) => set({ theme }),
}));
