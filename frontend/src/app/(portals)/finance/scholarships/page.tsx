'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type StudentLookup = {
  student: { user_id: string; name: string; official_email: string | null; enrollment_no: string | null; program_name: string | null };
  active_demand: { demand_id: string; total_amount: number; paid_amount: number; fee_head: string } | null;
};

export default function FinanceScholarshipsPage() {
  const api = useAuthedApi();
  const [studentId, setStudentId] = useState('');
  const [percent, setPercent] = useState('');
  const [lookup, setLookup] = useState<StudentLookup | null>(null);

  async function findStudent() {
    setLookup(null);
    try {
      const result = await api.get<StudentLookup>(`/finance/scholarships/student/${encodeURIComponent(studentId.trim())}`);
      setLookup(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Student lookup failed');
    }
  }

  async function apply() {
    const discount = Number(percent);
    if (!lookup?.active_demand || lookup.student.user_id !== studentId.trim() || !percent.trim() || !Number.isFinite(discount) || discount <= 0 || discount > 100) {
      toast.error('Enter a student ID and a discount between 0 and 100%.');
      return;
    }
    try {
      await api.post('/finance/scholarships', {
        student_user_id: studentId.trim(),
        discount_percent: discount,
      });
      toast.success('Scholarship applied to active demand');
      setStudentId('');
      setPercent('');
      setLookup(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4 md:p-6">
      <FinancePageHeader title="Scholarships & Waivers" description="Apply percentage discounts to a student's active fee demand." />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply waiver</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input aria-label="Student user ID" placeholder="Student user UUID" value={studentId} onChange={(e) => { setStudentId(e.target.value); setLookup(null); }} />
          <Button type="button" variant="outline" onClick={() => void findStudent()}>Find student and demand</Button>
          {lookup ? <p className="text-sm">{lookup.student.name} ({lookup.student.official_email ?? lookup.student.user_id}) · SID {lookup.student.enrollment_no || 'not recorded'} · {lookup.student.program_name || 'program not recorded'} · {lookup.active_demand ? `${lookup.active_demand.fee_head}: ₹${Number(lookup.active_demand.total_amount).toLocaleString('en-IN')}, paid ₹${Number(lookup.active_demand.paid_amount).toLocaleString('en-IN')}` : 'No active demand'}</p> : null}
          <Input aria-label="Scholarship discount percent" type="number" min="0.01" max="100" step="0.01" placeholder="Discount % (required)" value={percent} onChange={(e) => setPercent(e.target.value)} />
          <p className="text-xs text-muted-foreground">Confirm the student and active fee demand before applying. A scholarship cannot be applied twice to the same demand.</p>
          <Button disabled={!lookup?.active_demand} onClick={() => void apply()}>Apply scholarship</Button>
        </CardContent>
      </Card>
    </div>
  );
}
