'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';

type Clearance = {
  library: boolean;
  hostel: boolean;
  dept: boolean;
  finance: boolean;
  all_cleared: boolean;
};

type VerificationRow = {
  alumni_id: string;
  name: string;
  batch_year: number | null;
  current_organization: string | null;
  linkedin_url: string | null;
  program_name: string | null;
  higher_education_details?: { pursuing?: string } | null;
  clearance: Clearance;
};

function ClearanceDots({ clearance }: { clearance: Clearance }) {
  const items = [
    { label: 'Library', ok: clearance.library },
    { label: 'Hostel', ok: clearance.hostel },
    { label: 'Dept', ok: clearance.dept },
    { label: 'Finance', ok: clearance.finance },
  ];
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
      {items.map((item) => (
        <span key={item.label} className="whitespace-nowrap">
          {item.label} <span aria-hidden>{item.ok ? '🟢' : '🔴'}</span>
        </span>
      ))}
    </div>
  );
}

export default function AlumniVerificationInboxPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<VerificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    void api
      .get<VerificationRow[]>('/api/alumni-admin/verification')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [api]);

  async function approve(alumniId: string) {
    setActing(alumniId);
    try {
      await api.post(`/api/alumni-admin/verification/${alumniId}/approve`, {});
      toast.success('Student converted — welcome email sent to @mygyanvihar.com');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setActing(null);
    }
  }

  async function reject(alumniId: string) {
    setActing(alumniId);
    try {
      await api.post(`/api/alumni-admin/verifications/${alumniId}/reject`, {});
      toast.success('Conversion request rejected');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="Pending Alumni Verifications"
        description="IQAC / Alumni Admin inbox — approve only when systemic no-dues and final-semester requirements are fully green."
      />

      <DataTable
        isLoading={loading}
        columns={[
          {
            key: 'name',
            header: 'Student',
            render: (row) => (
              <div>
                <p className="font-semibold text-sgvu-navy">{row.name}</p>
                <p className="text-xs text-muted-foreground">
                  Batch {row.batch_year ?? '—'}
                  {row.program_name ? ` · ${row.program_name}` : ''}
                </p>
              </div>
            ),
          },
          {
            key: 'company',
            header: 'Current Company',
            render: (row) => row.current_organization ?? '—',
          },
          {
            key: 'higher_ed',
            header: 'Higher Ed',
            render: (row) => row.higher_education_details?.pursuing ?? '—',
          },
          {
            key: 'linkedin',
            header: 'LinkedIn',
            render: (row) =>
              row.linkedin_url ? (
                <Link
                  href={row.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sgvu-navy hover:underline"
                >
                  Profile <ExternalLink className="h-3 w-3" />
                </Link>
              ) : (
                '—'
              ),
          },
          {
            key: 'clearance',
            header: 'Clearance Status',
            render: (row) => <ClearanceDots clearance={row.clearance} />,
          },
          {
            key: 'actions',
            header: 'Action',
            render: (row) => (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="bg-sgvu-navy"
                  disabled={!row.clearance.all_cleared || acting === row.alumni_id}
                  title={
                    row.clearance.all_cleared
                      ? 'Execute alumni identity conversion'
                      : 'Blocked until Library, Hostel, Dept, and Finance are cleared'
                  }
                  onClick={() => void approve(row.alumni_id)}
                >
                  Approve & Convert
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={acting === row.alumni_id}
                  onClick={() => void reject(row.alumni_id)}
                >
                  Reject
                </Button>
              </div>
            ),
          },
        ]}
        rows={rows}
        rowKey={(row) => row.alumni_id}
        emptyMessage="No pending alumni verifications."
      />
    </div>
  );
}
