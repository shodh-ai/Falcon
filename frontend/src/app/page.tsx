'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { getDashboardPathForRole } from '@/lib/auth-routing';
import { useTenant } from '@/context/TenantContext';
import { LogIn } from 'lucide-react';

export default function Home() {
  const { isAuthenticated, login, user } = useAuth();
  const { branding } = useTenant();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && user) {
      router.push(getDashboardPathForRole(user.role));
    }
  }, [isAuthenticated, user, router]);

  const handleGoogleLogin = () => {
    window.location.href = api.login();
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    
    if (token) {
      // Fetch user profile with the token
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(res => res.json())
        .then(data => {
          login(token, data);
          router.push(getDashboardPathForRole(data.role));
        })
        .catch(err => console.error('Failed to fetch user profile', err));
    }
  }, [login, router]);

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {branding?.name ?? 'University ERP'}
            </h1>
            <p className="text-gray-600">
              Student, faculty &amp; management portal
            </p>
          </div>

          <div className="space-y-6">
            <button
              onClick={handleGoogleLogin}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 rounded-lg px-6 py-4 text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-400 transition-all"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google Workspace
            </button>

            <div className="text-center">
              <p className="text-sm text-gray-500">
                Only @mygyanvihar.com / @mygyanvihar.org emails are allowed
              </p>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="flex items-center justify-center gap-2 text-gray-600">
              <LogIn className="w-4 h-4" />
              <span className="text-sm">
                Secure login powered by Google OAuth
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Internal Quality Assurance Cell • Gyan Vihar University
          </p>
        </div>
      </div>
    </div>
  );
}
