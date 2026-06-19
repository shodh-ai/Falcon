'use client';

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';
import { getApiBaseUrl } from '@/lib/api-base-url';

export type AllowedEntity = { id: number; name: string; code: string };

interface User {
  user_id: string;
  email: string;
  name: string;
  role: string;
  roles?: string[];
  primaryRole?: string;
  role_id?: number;
  department?: string;
  dept_id?: number;
  tenant_id?: string;
  tenant_schema?: string;
  features?: string[];
  hr_capabilities?: Record<string, 'none' | 'read' | 'write'>;
  permissions?: string[];
  allowed_entities?: AllowedEntity[];
  onboarding_status?: string;
  has_direct_reports?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  refreshUser: () => Promise<User | null>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        try {
          const api = getApiBaseUrl();
          const { getSubdomainFromClient } = await import('@/lib/tenant');
            const headers = {
              Authorization: `Bearer ${storedToken}`,
              'x-tenant-subdomain': getSubdomainFromClient(),
            };
            const [profileRes, permsRes] = await Promise.all([
              fetch(`${api}/api/auth/me`, { headers }).catch(() => fetch(`${api}/auth/profile`, { headers })),
              fetch(`${api}/api/auth/me/permissions`, { headers }),
            ]);
            if (profileRes.ok) {
              const fresh = await profileRes.json();
              if (permsRes.ok) {
                const perms = await permsRes.json();
                fresh.permissions = perms.permissions ?? fresh.permissions;
                fresh.hr_capabilities = perms.hr_capabilities ?? fresh.hr_capabilities;
                fresh.allowed_entities = perms.allowed_entities ?? fresh.allowed_entities;
              }
              setUser(fresh);
              localStorage.setItem('user', JSON.stringify(fresh));
            }
        } catch {
          /* keep cached user if profile fetch fails */
        }
      }
      setIsLoading(false);
    };
    void load();
  }, []);

  const login = useCallback((newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }, []);

  const refreshUser = useCallback(async () => {
    const activeToken = token || localStorage.getItem('token');
    if (!activeToken) return null;

    const { getSubdomainFromClient } = await import('@/lib/tenant');
    const headers = {
      Authorization: `Bearer ${activeToken}`,
      'x-tenant-subdomain': getSubdomainFromClient(),
    };
    const api = getApiBaseUrl();
    const [response, permsRes] = await Promise.all([
      fetch(`${api}/api/auth/me`, { headers }).catch(() => fetch(`${api}/auth/profile`, { headers })),
      fetch(`${api}/api/auth/me/permissions`, { headers }),
    ]);

    if (!response.ok) return null;

    const freshUser = await response.json();
    if (permsRes.ok) {
      const perms = await permsRes.json();
      freshUser.permissions = perms.permissions ?? freshUser.permissions;
      freshUser.hr_capabilities = perms.hr_capabilities ?? freshUser.hr_capabilities;
      freshUser.allowed_entities = perms.allowed_entities ?? freshUser.allowed_entities;
    }
    setUser(freshUser);
    localStorage.setItem('user', JSON.stringify(freshUser));
    return freshUser;
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      refreshUser,
      logout,
      isAuthenticated: !!token,
      isLoading,
    }),
    [user, token, login, refreshUser, logout, isLoading],
  );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
