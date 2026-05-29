'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';

type StudentProfile = {
  bank_details: {
    account_number?: string;
    ifsc?: string;
    bank_name?: string;
  } | null;
  bank_details_update_requested: boolean;
};

export default function StudentProfilePage() {
  const { user } = useAuth();
  const api = useAuthedApi();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBank, setSavingBank] = useState(false);
  const [bankForm, setBankForm] = useState({ account_number: '', ifsc: '', bank_name: '' });

  useEffect(() => {
    async function loadProfile() {
      try {
        const data = await api.get<StudentProfile>('/api/academics/proctor/profile/me');
        setProfile(data);
        setBankForm({
          account_number: data.bank_details?.account_number ?? '',
          ifsc: data.bank_details?.ifsc ?? '',
          bank_name: data.bank_details?.bank_name ?? '',
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    void loadProfile();
  }, []);

  const bankUpdatePending = useMemo(() => profile?.bank_details_update_requested === true, [profile?.bank_details_update_requested]);

  async function updateBankDetails() {
    const accountRegex = /^[0-9]{9,18}$/;
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!accountRegex.test(bankForm.account_number)) {
      toast.error('Account number must be 9-18 digits.');
      return;
    }
    if (!ifscRegex.test(bankForm.ifsc.toUpperCase())) {
      toast.error('Invalid IFSC code format.');
      return;
    }

    setSavingBank(true);
    try {
      const updated = await api.patch<StudentProfile>('/api/academics/proctor/profile/me', {
        bank_details: {
          account_number: bankForm.account_number,
          ifsc: bankForm.ifsc.toUpperCase(),
          bank_name: bankForm.bank_name,
        },
        request_bank_details_update_approval: true,
      });
      setProfile(updated);
      toast.success('Bank details update submitted for approval');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update bank details');
    } finally {
      setSavingBank(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy sm:text-3xl">My Profile & Document Vault</h2>
        <p className="mt-1 text-sm text-muted-foreground">Keep personal, guardian, and bank information up-to-date with secure controls.</p>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl">{user?.name?.charAt(0) ?? 'S'}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{user?.name ?? 'Student'}</CardTitle>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Personal Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input defaultValue="BTECH-CSE-2024-0042" disabled />
            <Input defaultValue="Parent/Guardian: +91-98XXXXXXXX" />
            <Input defaultValue="Address: Jaipur, Rajasthan" />
            <Button className="w-full">Save Personal Details</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Bank Details</CardTitle>
            <Badge variant="secondary">OTP/Approval Required</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
          {loading && <p className="text-sm text-muted-foreground">Loading bank details...</p>}
          {bankUpdatePending && (
            <p className="text-sm text-amber-600">Bank update is pending admin approval.</p>
          )}
          <Input
            placeholder="Account Number"
            value={bankForm.account_number}
            onChange={(event) => setBankForm((prev) => ({ ...prev, account_number: event.target.value }))}
            disabled={bankUpdatePending}
          />
          <Input
            placeholder="IFSC Code"
            value={bankForm.ifsc}
            onChange={(event) => setBankForm((prev) => ({ ...prev, ifsc: event.target.value }))}
            disabled={bankUpdatePending}
          />
          <Input
            placeholder="Bank Name"
            value={bankForm.bank_name}
            onChange={(event) => setBankForm((prev) => ({ ...prev, bank_name: event.target.value }))}
            disabled={bankUpdatePending}
          />
          <Button className="w-full" onClick={updateBankDetails} disabled={bankUpdatePending || savingBank}>
            {savingBank ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update Bank Details'}
          </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Vault (Read-only)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {['Aadhar Card', '10th Marksheet', '12th Marksheet', 'Transfer Certificate'].map((doc) => (
            <div key={doc} className="rounded-lg border p-3">
              <p className="font-medium">{doc}</p>
              <p className="text-xs text-muted-foreground">Verified by AI</p>
              <Button variant="link" className="h-auto p-0 text-xs">
                View Document
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
