'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FalconLogo } from '@/components/brand/FalconLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getSubdomainFromClient } from '@/lib/tenant';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ParentLoginPage() {
  const router = useRouter();
  const [mobile, setMobile] = useState('+919999000001');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestOtp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/parent/otp/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
        body: JSON.stringify({ mobile }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Failed to send OTP');
      setDevOtp(data.dev_otp ?? null);
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/parent/otp/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
        body: JSON.stringify({ mobile, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Invalid OTP');
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.replace('/parent/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
        <FalconLogo variant="full" size={40} />
        <div>
          <h1 className="text-xl font-bold text-sgvu-navy">Parent Portal</h1>
          <p className="text-sm text-muted-foreground">Sign in with your registered mobile number (OTP via SMS/WhatsApp).</p>
        </div>
        {step === 'mobile' ? (
          <>
            <Input placeholder="+91XXXXXXXXXX" value={mobile} onChange={(e) => setMobile(e.target.value)} />
            <Button className="w-full" disabled={loading} onClick={() => void requestOtp()}>
              Send OTP
            </Button>
          </>
        ) : (
          <>
            <Input placeholder="6-digit OTP" value={otp} onChange={(e) => setOtp(e.target.value)} />
            {devOtp && <p className="text-xs text-amber-700">Dev OTP: {devOtp}</p>}
            <Button className="w-full" disabled={loading} onClick={() => void verifyOtp()}>
              Verify & enter portal
            </Button>
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <p className="text-center text-xs text-muted-foreground">Read-only access to your child&apos;s academic and fee records.</p>
      </div>
    </div>
  );
}
