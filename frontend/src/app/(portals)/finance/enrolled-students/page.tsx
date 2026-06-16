'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

export default function FinanceEnrolledStudentsPage() {
  const api = useAuthedApi();
  const [students, setStudents] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [branch, setBranch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTx, setUploadingTx] = useState<string | null>(null);

  const loadStudents = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (year) params.set('year', year);
    if (branch) params.set('branch', branch);
    
    api.get<any[]>(`/api/admissions-crm/enrolled-students?${params.toString()}`).then(setStudents);
  };

  useEffect(() => {
    loadStudents();
  }, [api, q, year, branch]);

  function handleUploadReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingTx) return;

    const formData = new FormData();
    formData.append('file', file);

    api.post<{ path: string }>('/api/uploads/single', formData)
      .then((res) => {
        return api.patch(`/api/admissions-crm/transactions/${uploadingTx}/receipt`, {
          receipt_url: res.path,
        });
      })
      .then(() => {
        toast.success('Receipt uploaded successfully');
        loadStudents();
      })
      .catch(() => toast.error('Failed to upload receipt'))
      .finally(() => {
        setUploadingTx(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Enrolled Students Payment status</h1>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex gap-4 mb-4">
              <input 
                type="text" 
                placeholder="Search name, email, ID..." 
                className="border rounded px-3 py-2 text-sm w-64"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select 
                className="border rounded px-3 py-2 text-sm"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All Years</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
              <select 
                className="border rounded px-3 py-2 text-sm"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">All Branches</option>
                <option value="1">Computer Science</option>
                <option value="2">Mechanical Engineering</option>
                <option value="3">Civil Engineering</option>
                <option value="4">Electrical Engineering</option>
              </select>
            </div>

            <input 
              type="file" 
              accept="application/pdf,image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleUploadReceipt} 
            />

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">Student Name</th>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Student ID</th>
                    <th className="p-3 font-medium">Branch / Year</th>
                    <th className="p-3 font-medium">Fee Transactions</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">No students found.</td>
                    </tr>
                  )}
                  {students.map((s) => (
                    <tr key={s.user_id} className="border-b">
                      <td className="p-3">{s.name}</td>
                      <td className="p-3">{s.email}</td>
                      <td className="p-3">{s.enrollment_no ?? '—'}</td>
                      <td className="p-3">{s.dept_name ?? '—'} <br/><span className="text-xs text-muted-foreground">{s.batch ?? '—'}</span></td>
                      <td className="p-3">
                        <div className="space-y-2">
                          {s.transactions?.length > 0 ? s.transactions.map((t: any) => (
                            <div key={t.transaction_id} className="flex items-center gap-2 text-xs border rounded p-2 bg-slate-50">
                              <div className="flex-1">
                                <p className="font-semibold">{t.fee_head ?? 'Fee Payment'}</p>
                                <p className="text-muted-foreground">Tx: {t.transaction_id.slice(0, 8)}... | ₹{t.amount}</p>
                              </div>
                              {t.receipt_url ? (
                                <a 
                                  className="text-sgvu-navy underline bg-white border px-2 py-1 rounded" 
                                  href={t.receipt_url.startsWith('http') ? t.receipt_url : `/api/uploads/download?path=${encodeURIComponent(t.receipt_url)}`} 
                                  target="_blank" 
                                  rel="noreferrer"
                                >
                                  PDF
                                </a>
                              ) : (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setUploadingTx(t.transaction_id);
                                    fileInputRef.current?.click();
                                  }}
                                  disabled={uploadingTx === t.transaction_id}
                                >
                                  {uploadingTx === t.transaction_id ? '...' : 'Upload'}
                                </Button>
                              )}
                            </div>
                          )) : (
                            <span className="text-muted-foreground text-xs">No success transactions</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
