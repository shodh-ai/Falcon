'use client';

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect, useRef } from 'react';
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
  tenant_subdomain?: string;
  tenant_schema?: string;
  features?: string[];
  hr_capabilities?: Record<string, 'none' | 'read' | 'write'>;
  permissions?: string[];
  allowed_entities?: AllowedEntity[];
  onboarding_status?: string;
  has_direct_reports?: boolean;
  is_department_hod?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User, rememberMe?: boolean) => void;
  refreshUser: () => Promise<User | null>;
  updateOnboardingStatus: (status: string) => boolean;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_COOKIE = 'falcon_auth_token';

function writeAuthCookie(token: string | null, rememberMe = false) {
  if (typeof document === 'undefined') return;
  // Still readable by JS (middleware gate) — not HttpOnly. Prefer short TTL + HTTPS Secure.
  // Full HttpOnly cookie sessions need a backend Set-Cookie login path.
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  const maxAgeSeconds = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
  if (token) {
    document.cookie = `${AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
  } else {
    document.cookie = `${AUTH_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeTokenRef = useRef<string | null>(null);
  const activeUserRef = useRef<User | null>(null);
  const authGeneration = useRef(0);
  const [authRevision, setAuthRevision] = useState(0);
  const refreshGeneration = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const generation = authGeneration.current;
    const requestId = ++refreshGeneration.current;
    const load = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        let cachedUser: User;
        try {
          cachedUser = JSON.parse(storedUser);
          if (!cachedUser || typeof cachedUser.user_id !== 'string') throw new Error('Invalid cached account');
        } catch {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          writeAuthCookie(null);
          if (mounted.current) setIsLoading(false);
          return;
        }
        activeTokenRef.current = storedToken;
        activeUserRef.current = cachedUser;
        setToken(storedToken);
        setUser(cachedUser);
        writeAuthCookie(storedToken);
        try {
          const api = getApiBaseUrl();
          const { getSubdomainFromClient } = await import('@/lib/tenant');
          const tenantSubdomain = getSubdomainFromClient();
          const headers = {
            Authorization: `Bearer ${storedToken}`,
            'x-tenant-subdomain': tenantSubdomain,
          };
          const [profileRes, permsRes] = await Promise.all([
            fetch(`${api}/api/auth/me`, { headers }).catch(() => fetch(`${api}/auth/profile`, { headers })),
            fetch(`${api}/api/auth/me/permissions`, { headers }),
          ]);
          if (profileRes.ok) {
            const fresh = await profileRes.json();
            // The profile endpoint is tenant-scoped but does not currently
            // repeat the tenant subdomain. Keep that resolved context on the
            // cached user so post-login routing cannot fall back to an
            // unrelated role workspace on the shared Falcon hostname.
            fresh.tenant_subdomain ??= tenantSubdomain;
            if (permsRes.ok) {
              const perms = await permsRes.json();
              fresh.permissions = perms.permissions ?? fresh.permissions;
              fresh.hr_capabilities = perms.hr_capabilities ?? fresh.hr_capabilities;
              fresh.allowed_entities = perms.allowed_entities ?? fresh.allowed_entities;
            }
            if (mounted.current && generation === authGeneration.current && requestId === refreshGeneration.current && activeTokenRef.current === storedToken && localStorage.getItem('token') === storedToken) {
              activeUserRef.current = fresh;
              setUser(fresh);
              localStorage.setItem('user', JSON.stringify(fresh));
            }
          }
        } catch {
          /* keep cached user if profile fetch fails */
        }
      }
      if (mounted.current) setIsLoading(false);
    };
    void load();
    return () => { mounted.current = false; refreshGeneration.current += 1; };
  }, []);

  const login = useCallback((newToken: string, newUser: User, rememberMe = false) => {
    activeTokenRef.current = newToken;
    activeUserRef.current = newUser;
    authGeneration.current += 1;
    setAuthRevision(authGeneration.current);
    refreshGeneration.current += 1;
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    writeAuthCookie(newToken, rememberMe);
  }, []);

  const logout = useCallback(() => {
    activeTokenRef.current = null;
    activeUserRef.current = null;
    authGeneration.current += 1;
    setAuthRevision(authGeneration.current);
    refreshGeneration.current += 1;
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    writeAuthCookie(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const activeToken = token || localStorage.getItem('token');
    if (!activeToken || activeTokenRef.current !== activeToken || localStorage.getItem('token') !== activeToken) return null;
    const generation = authGeneration.current;
    const requestId = ++refreshGeneration.current;
    const isCurrent = () => mounted.current && generation === authGeneration.current && requestId === refreshGeneration.current && activeTokenRef.current === activeToken && localStorage.getItem('token') === activeToken;

    try {
    const { getSubdomainFromClient } = await import('@/lib/tenant');
    if (!isCurrent()) return null;
    const tenantSubdomain = getSubdomainFromClient();
    const headers = {
      Authorization: `Bearer ${activeToken}`,
      'x-tenant-subdomain': tenantSubdomain,
    };
    const api = getApiBaseUrl();
    const [response, permsRes] = await Promise.all([
      fetch(`${api}/api/auth/me`, { headers }).catch(() => fetch(`${api}/auth/profile`, { headers })),
      fetch(`${api}/api/auth/me/permissions`, { headers }),
    ]);

    if (!isCurrent()) return null;
    if (!response.ok) return null;

    const freshUser = await response.json();
    freshUser.tenant_subdomain ??= tenantSubdomain;
    if (permsRes.ok) {
      const perms = await permsRes.json();
      freshUser.permissions = perms.permissions ?? freshUser.permissions;
      freshUser.hr_capabilities = perms.hr_capabilities ?? freshUser.hr_capabilities;
      freshUser.allowed_entities = perms.allowed_entities ?? freshUser.allowed_entities;
    }
    if (!isCurrent()) return null;
    activeUserRef.current = freshUser;
    setUser(freshUser);
    localStorage.setItem('user', JSON.stringify(freshUser));
    return freshUser;
    } catch (error) {
      if (!isCurrent()) return null;
      throw error;
    }
  }, [token]);

  const updateOnboardingStatus = useCallback((status: string) => {
    const activeUser = activeUserRef.current;
    if (!mounted.current || !token || !activeUser || activeUser.user_id !== user?.user_id
      || authGeneration.current !== authRevision || activeTokenRef.current !== token
      || localStorage.getItem('token') !== token) return false;
    const freshUser = { ...activeUser, onboarding_status: status };
    refreshGeneration.current += 1;
    activeUserRef.current = freshUser;
    setUser(freshUser);
    localStorage.setItem('user', JSON.stringify(freshUser));
    return true;
  }, [token, user?.user_id, authRevision]);

  const value = useMemo(
    () => ({
      user,
      token,
      login,
      refreshUser,
      updateOnboardingStatus,
      logout,
      isAuthenticated: !!token,
      isLoading,
    }),
    [user, token, login, refreshUser, updateOnboardingStatus, logout, isLoading],
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
