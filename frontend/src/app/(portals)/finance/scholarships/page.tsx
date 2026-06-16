'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

export default function FinanceScholarshipsPage() {
  const api = useAuthedApi();
  const [studentId, setStudentId] = useState('');
  const [percent, setPercent] = useState('50');

  async function apply() {
    try {
      await api.post('/finance/scholarships', {
        student_user_id: studentId,
        discount_percent: Number(percent),
      });
      toast.success('Scholarship applied to active demand');
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
          <Input placeholder="Student user UUID" value={studentId} onChange={(e) => setStudentId(e.target.value)} />
          <Input placeholder="Discount %" value={percent} onChange={(e) => setPercent(e.target.value)} />
          <Button onClick={() => void apply()}>Apply scholarship</Button>
        </CardContent>
      </Card>
    </div>
  );
}
