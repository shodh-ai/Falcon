'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Building2, Plus, ShoppingBag, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentLoadingState } from '@/components/student/StudentLoadingState';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { StudentInfoTile } from '@/components/student/StudentInfoTile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Allocation = {
  hostel_block: string | null;
  room_number: string | null;
  bed_number: string | null;
  mess_plan: string;
  warden: { name: string } | null;
};

type WalletData = { current_balance: string };
type CatalogItem = { item_id: string; item_name: string; price: string; meal_type: string };

export default function CampusLifePage() {
  const api = useAuthedApi();
  const [allocation, setAllocation] = useState<Allocation | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [hostelSaleActive, setHostelSaleActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [gatePass, setGatePass] = useState({ out_date: '', in_date: '', reason: '', destination: '' });
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      try {
        const [alloc, wal, cat, settings] = await Promise.all([
          api.get<Allocation | null>('/api/operations/hostel/my-allocation'),
          api.get<WalletData>('/api/campus-wallet/me').catch(() => null),
          api.get<CatalogItem[]>('/api/campus-wallet/mess/catalog').catch(() => []),
          api.get<{ is_hostel_sale_active: boolean }>('/api/student/campus-settings'),
        ]);
        setAllocation(alloc);
        setWallet(wal);
        setCatalog(cat);
        setHostelSaleActive(settings.is_hostel_sale_active);
      } catch {
        toast.error('Could not load campus life data');
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

  async function orderAddon(item: CatalogItem) {
    const qty = cart[item.item_id] ?? 1;
    try {
      await api.post('/api/mess/order', {
        item_id: item.item_id,
        meal_type: item.meal_type,
        quantity: qty,
        order_date: new Date().toISOString().slice(0, 10),
      });
      toast.success(`${item.item_name} added to your mess order`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Order failed');
    }
  }

  if (loading) return <StudentLoadingState label="Loading campus life…" />;

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Campus Life"
        description="Hostel, Falcon Wallet, and mess add-ons — one unified Falcon workspace."
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
              <StudentInfoTile label="Block · Room" value={`${allocation.hostel_block} · ${allocation.room_number}`} />
              <StudentInfoTile label="Bed" value={allocation.bed_number} />
              <StudentInfoTile label="Mess plan" value={allocation.mess_plan} />
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

      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="space-y-6"
      >
        <StudentSectionCard title="Falcon Wallet & Mess" description="Balance and Swiggy-style add-ons" icon={Wallet}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-sgvu-navy p-5 text-white">
            <div>
              <p className="text-xs uppercase tracking-wider text-white/70">Falcon Pay balance</p>
              <p className="text-3xl font-black">₹{Number(wallet?.current_balance ?? 0).toFixed(2)}</p>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link href="/student/finance">Top up via Finance</Link>
            </Button>
          </div>

          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-sgvu-navy">
            <ShoppingBag className="h-4 w-4" />
            Mess add-on menu
          </p>
          {catalog.length === 0 ? (
            <StudentEmptyState title="No add-ons today" description="Check back at meal times." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {catalog.slice(0, 8).map((item) => (
                <div key={item.item_id} className="flex items-center justify-between rounded-2xl border p-4">
                  <div>
                    <p className="font-medium text-sgvu-navy">{item.item_name}</p>
                    <Badge variant="outline" className="mt-1">{item.meal_type}</Badge>
                    <p className="mt-1 text-sm text-muted-foreground">₹{item.price}</p>
                  </div>
                  <Button size="sm" onClick={() => void orderAddon(item)}>
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </StudentSectionCard>
      </motion.section>
    </StudentPageShell>
  );
}
