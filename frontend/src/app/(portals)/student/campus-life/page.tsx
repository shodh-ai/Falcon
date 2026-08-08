'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentInfoTile } from '@/components/student/StudentInfoTile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { DEMO_HOSTEL } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

type Allocation = {
  hostel_block: string | null;
  room_number: string | null;
  bed_number: string | null;
  floor?: string;
  mess_plan: string;
  mess_status?: string;
  warden: { name: string } | null;
};

export default function CampusLifePage() {
  const api = useAuthedApi();
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [hostelSaleActive, setHostelSaleActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gatePass, setGatePass] = useState({ out_date: '', in_date: '', reason: '', destination: '' });

  useEffect(() => {
    async function load() {
      try {
        const [alloc, settings] = await Promise.all([
          api.get<Allocation | null>('/api/operations/hostel/my-allocation'),
          api.get<{ is_hostel_sale_active: boolean }>('/api/student/campus-settings'),
        ]);
        setAllocation(alloc ?? (isStudentDemoModeEnabled() ? DEMO_HOSTEL : null));
        setHostelSaleActive(settings.is_hostel_sale_active);
      } catch {
        if (isStudentDemoModeEnabled()) {
          setAllocation(DEMO_HOSTEL);
          toast.error('Could not load campus life data — showing demo allocation');
        } else {
          setAllocation(null);
          toast.error('Could not load campus life data');
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [api]);

  async function submitGatePass() {
    if (!gatePass.out_date || !gatePass.reason.trim()) {
      toast.error('Fill gate pass details');
      return;
    }
    try {
      await api.post('/api/operations/hostel/requests', {
        request_type: 'GATE_PASS',
        remarks: gatePass.reason.trim(),
        payload: gatePass,
      });
      toast.success('🏨 Hostel exit/gate pass sent to Warden');
      setGatePass({ out_date: '', in_date: '', reason: '', destination: '' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gate pass failed');
    }
  }

  if (loading) return <StudentLoadingState label="Loading campus life…" />;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Campus Life"
        description="Hostel allocation, room details, and gate pass requests."
      />

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <StudentSectionCard title="Hostel & room" description="Allocation, roommates, gate pass" icon={Building2} tone="gold">
          {!allocation ? (
            <StudentEmptyState
              title="No room allocated"
              description={hostelSaleActive ? 'Book a room during the active sale window.' : 'Hostel booking opens when the Chief Warden activates sales.'}
              action={
                hostelSaleActive ? (
                  <Button asChild>
                    <Link href="/student/hostel-booking">Book Room</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <StudentInfoTile label="Hostel · Room" value={`${allocation.hostel_block} · ${allocation.room_number}`} />
              <StudentInfoTile label="Bed / Floor" value={`${allocation.bed_number}${'floor' in allocation && allocation.floor ? ` · ${allocation.floor}` : ''}`} />
              <StudentInfoTile
                label="Mess status"
                value={`${allocation.mess_plan}${
                  'mess_status' in allocation && allocation.mess_status
                    ? ` · ${String(allocation.mess_status)}`
                    : ''
                }`}
              />
              <StudentInfoTile label="Warden" value={allocation.warden?.name} />
            </div>
          )}

          <div className="mt-6 rounded-2xl border border-border/70 bg-white p-4">
            <p className="mb-3 text-sm font-semibold text-sgvu-navy">🏨 Apply Hostel Exit/Gate Pass</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input type="date" value={gatePass.out_date} onChange={(e) => setGatePass({ ...gatePass, out_date: e.target.value })} />
              <Input type="date" value={gatePass.in_date} onChange={(e) => setGatePass({ ...gatePass, in_date: e.target.value })} />
              <Input placeholder="Destination" value={gatePass.destination} onChange={(e) => setGatePass({ ...gatePass, destination: e.target.value })} />
              <Input placeholder="Reason" value={gatePass.reason} onChange={(e) => setGatePass({ ...gatePass, reason: e.target.value })} />
            </div>
            <Button className="mt-3" onClick={() => void submitGatePass()} disabled={!allocation}>
              Submit to Warden
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Academic leave of absence?{' '}
              <Link href="/student/mentorship" className="font-semibold text-sgvu-navy underline">
                📚 Apply via Mentorship / Proctor
              </Link>
            </p>
          </div>
        </StudentSectionCard>
      </motion.section>
    </StudentPageShell>
  );
}
