'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { BedDouble, Building2, Layers, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

type Bed = {
  bed_id: string;
  bed_number: string;
  display_status: string;
  is_premium: boolean;
};

type Room = { room_number: string; beds: Bed[] };
type Floor = { floor: string; rooms: Room[] };
type HostelBlock = { hostel_block: string; floors: Floor[] };

const STATUS = {
  AVAILABLE: { label: 'Available', className: 'bg-emerald-500 hover:bg-emerald-600' },
  IN_CART: { label: 'In checkout', className: 'bg-amber-400 hover:bg-amber-500 text-sgvu-navy' },
  BOOKED: { label: 'Occupied', className: 'bg-red-600' },
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function StudentHostelBookingPage() {
  const router = useRouter();
  const api = useAuthedApi();
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<HostelBlock[]>([]);
  const [selectedHostel, setSelectedHostel] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('');
  const [selectedRoom, setSelectedRoom] = useState('');
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);

  async function load() {
    const c = await api.get<HostelBlock[]>('/api/hostel-tatkal/catalog');
    setCatalog(c);
    if (!selectedHostel && c[0]) setSelectedHostel(c[0].hostel_block);
  }

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    const socket: Socket = io(`${API_BASE}/hostel-tatkal`, { transports: ['websocket'] });
    const tenantId = user?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
    socket.emit('joinSale', { tenant_id: tenantId });
    socket.on('bed.update', (payload: { bed_id?: string; bedId?: string; display_status?: string; status?: string }) => {
      const bedId = payload.bedId ?? payload.bed_id;
      const status = payload.status ?? payload.display_status;
      if (!bedId || !status) return;
      setCatalog((prev) =>
        prev.map((h) => ({
          ...h,
          floors: h.floors.map((f) => ({
            ...f,
            rooms: f.rooms.map((r) => ({
              ...r,
              beds: r.beds.map((b) => (b.bed_id === bedId ? { ...b, display_status: status } : b)),
            })),
          })),
        })),
      );
    });
    return () => {
      socket.disconnect();
    };
  }, [user?.tenant_id]);

  const hostel = catalog.find((h) => h.hostel_block === selectedHostel);
  const floor = hostel?.floors.find((f) => f.floor === selectedFloor);
  const room = floor?.rooms.find((r) => r.room_number === selectedRoom);

  useEffect(() => {
    if (hostel?.floors[0] && !selectedFloor) setSelectedFloor(hostel.floors[0].floor);
  }, [hostel, selectedFloor]);

  useEffect(() => {
    if (floor?.rooms[0] && !selectedRoom) setSelectedRoom(floor.rooms[0].room_number);
  }, [floor, selectedRoom]);

  const legend = useMemo(
    () => [
      { key: 'AVAILABLE', ...STATUS.AVAILABLE },
      { key: 'IN_CART', ...STATUS.IN_CART },
      { key: 'BOOKED', ...STATUS.BOOKED },
    ],
    [],
  );

  async function selectBed(bedId: string) {
    setLocking(true);
    try {
      const res = await api.post<{ hold_id: string }>('/api/hostel-tatkal/lock-bed', { bed_id: bedId });
      router.push(`/student/hostel-booking/checkout?holdId=${res.hold_id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Bed unavailable';
      if (msg.includes('409') || msg.toLowerCase().includes('checkout')) {
        toast.error('Another student is checking out this bed.');
      } else {
        toast.error(msg);
      }
    } finally {
      setLocking(false);
    }
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Hostel Bed Booking"
        description="Pick hostel → floor → room → bed. You have a 3-minute checkout window once a bed is reserved."
      />

      <div className="flex flex-wrap gap-3 text-xs">
        {legend.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5 rounded-full border bg-white px-2 py-1">
            <span className={`h-2.5 w-2.5 rounded-full ${l.className.split(' ')[0]}`} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4" /> Hostel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-sgvu-navy" />}
            {catalog.map((h) => (
              <button
                key={h.hostel_block}
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedHostel === h.hostel_block ? 'bg-sgvu-navy text-white' : 'hover:bg-muted'}`}
                onClick={() => {
                  setSelectedHostel(h.hostel_block);
                  setSelectedFloor('');
                  setSelectedRoom('');
                }}
              >
                {h.hostel_block}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4" /> Floor
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {hostel?.floors.map((f) => (
              <button
                key={f.floor}
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedFloor === f.floor ? 'bg-sgvu-navy text-white' : 'hover:bg-muted'}`}
                onClick={() => {
                  setSelectedFloor(f.floor);
                  setSelectedRoom('');
                }}
              >
                {f.floor}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {floor?.rooms.map((r) => (
              <button
                key={r.room_number}
                type="button"
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedRoom === r.room_number ? 'bg-sgvu-navy text-white' : 'hover:bg-muted'}`}
                onClick={() => setSelectedRoom(r.room_number)}
              >
                {r.room_number}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BedDouble className="h-4 w-4" /> Beds
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {room?.beds.map((bed) => {
              const st = STATUS[bed.display_status as keyof typeof STATUS] ?? STATUS.AVAILABLE;
              return (
                <button
                  key={bed.bed_id}
                  type="button"
                  disabled={bed.display_status !== 'AVAILABLE' || locking}
                  title={bed.bed_number}
                  className={`min-w-[4rem] rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50 ${st.className}`}
                  onClick={() => void selectBed(bed.bed_id)}
                >
                  {bed.bed_number}
                  {bed.is_premium && <Badge className="ml-1 scale-75">★</Badge>}
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </StudentPageShell>
  );
}
