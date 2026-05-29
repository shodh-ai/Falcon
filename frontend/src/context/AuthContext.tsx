'use client';

import React, { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

interface User {
  user_id: string;
  email: string;
  name: string;
  role: string;
  role_id?: number;
  department?: string;
  dept_id?: number;
  tenant_id?: string;
  tenant_schema?: string;
  features?: string[];
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
          const api = process.env.NEXT_PUBLIC_API_URL;
          if (api) {
            const { getSubdomainFromClient } = await import('@/lib/tenant');
            const res = await fetch(`${api}/auth/profile`, {
              headers: {
                Authorization: `Bearer ${storedToken}`,
                'x-tenant-subdomain': getSubdomainFromClient(),
              },
            });
            if (res.ok) {
              const fresh = await res.json();
              setUser(fresh);
              localStorage.setItem('user', JSON.stringify(fresh));
            }
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
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/profile`, {
      headers: {
        Authorization: `Bearer ${activeToken}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
    });

    if (!response.ok) return null;

    const freshUser = await response.json();
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
