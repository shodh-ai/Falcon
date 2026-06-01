'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

export default function PlacementResumesPage() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const [studentId, setStudentId] = useState(user?.user_id ?? '');

  async function generate() {
    try {
      const res = await api.post<{ resume_pdf_path: string }>(`/api/placement/resumes/${studentId}/generate`, {});
      toast.success(`Resume generated: ${res.resume_pdf_path}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="p-6 max-w-lg space-y-4">
      <h1 className="text-xl font-bold text-sgvu-navy">Resume Builder</h1>
      <p className="text-sm text-muted-foreground">University-branded PDF from student profile data.</p>
      <Input value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="Student user UUID" />
      <Button onClick={() => void generate()}>Generate PDF</Button>
    </div>
  );
}
