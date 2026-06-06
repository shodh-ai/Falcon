'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, UserPlus } from 'lucide-react';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrPersonCell } from '@/components/hr/HrAvatar';
import { HrEmptyState } from '@/components/hr/HrEmptyState';
import { HrDataTable, HrTable, HrTableHead, HrTh, HrTableBody, HrTr, HrTd } from '@/components/hr/HrDataTable';
import { HrStatusBadge } from '@/components/hr/HrStatusBadge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

function formatJoinDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

type NewHire = {
  user_id: string;
  name: string;
  email: string;
  designation: string | null;
  joining_date: string | null;
  employee_id: string | null;
  job_title: string | null;
  total_tasks: number;
  completed_tasks: number;
  progress_percent: number;
};

export default function HrOnboardingPage() {
  const router = useRouter();
  const api = useHrApi();
  const { entityReady, loading: entityLoading } = useHrEntity();
  const [rows, setRows] = useState<NewHire[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entityReady) return;
    setLoading(true);
    void api
      .get<NewHire[]>('/api/hr/onboarding')
      .then(setRows)
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [api, entityReady]);

  if (entityLoading || loading) {
    return <FalconLoader label="Loading new hires…" />;
  }

  return (
    <>
      <HrPageHeader
        title="Onboarding"
        description="New hires with active onboarding workflows. Open a hire to complete their Zimyo-style checklist."
      />

      {rows.length === 0 ? (
        <HrEmptyState
          icon={UserPlus}
          title="No active onboarding workflows"
          description="Move a candidate to Hired in Recruitment (ATS) to provision their account and generate this checklist automatically."
        />
      ) : (
        <HrDataTable>
          <HrTable minWidth="960px">
            <HrTableHead>
              <HrTh className="w-[28%]">Employee</HrTh>
              <HrTh className="w-[22%]">Role / Job</HrTh>
              <HrTh className="w-[12%]">Joining</HrTh>
              <HrTh className="w-[18%]">Progress</HrTh>
              <HrTh className="w-[10%]">Status</HrTh>
              <HrTh className="w-[10%] text-right">Action</HrTh>
            </HrTableHead>
            <HrTableBody>
              {rows.map((row) => {
                const status =
                  row.progress_percent >= 100
                    ? 'COMPLETED'
                    : row.progress_percent > 0
                      ? 'IN_PROGRESS'
                      : 'PENDING';
                const href = `/hr/onboarding/${row.user_id}`;
                return (
                  <HrTr
                    key={row.user_id}
                    className="group"
                    onClick={() => router.push(href)}
                  >
                    <HrTd>
                      <HrPersonCell
                        name={row.name}
                        subtitle={
                          row.employee_id ? `${row.email} · ${row.employee_id}` : row.email
                        }
                      />
                    </HrTd>
                    <HrTd>
                      <span className="block font-medium text-sgvu-navy">{row.designation ?? '—'}</span>
                      {row.job_title ? (
                        <span className="block text-xs text-muted-foreground">{row.job_title}</span>
                      ) : null}
                    </HrTd>
                    <HrTd className="whitespace-nowrap text-muted-foreground">
                      {formatJoinDate(row.joining_date)}
                    </HrTd>
                    <HrTd>
                      <div className="min-w-[140px] space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            {row.completed_tasks}/{row.total_tasks} tasks
                          </span>
                          <span className="font-semibold text-sgvu-navy">{row.progress_percent}%</span>
                        </div>
                        <Progress value={row.progress_percent} className="h-2" />
                      </div>
                    </HrTd>
                    <HrTd>
                      <HrStatusBadge status={status} />
                    </HrTd>
                    <HrTd className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        asChild
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={href}>
                          Open
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    </HrTd>
                  </HrTr>
                );
              })}
            </HrTableBody>
          </HrTable>
        </HrDataTable>
      )}
    </>
  );
}
