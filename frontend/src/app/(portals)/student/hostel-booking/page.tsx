'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { Card, CardContent } from '@/components/ui/card';
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
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [roomTypeFilter, setRoomTypeFilter] = useState('ALL');
  const [acFilter, setAcFilter] = useState('ALL');
  const [saleActive, setSaleActive] = useState<boolean | null>(null);

  async function load() {
    const settings = await api.get<{ is_hostel_sale_active: boolean }>('/api/student/campus-settings');
    setSaleActive(settings.is_hostel_sale_active);
    if (!settings.is_hostel_sale_active) return;
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

  let visibleRooms = floor?.rooms ?? [];
  if (roomTypeFilter !== 'ALL') {
    const targetSize = parseInt(roomTypeFilter, 10);
    visibleRooms = visibleRooms.filter((r) => r.beds.length === targetSize);
  }
  if (acFilter !== 'ALL') {
    visibleRooms = visibleRooms.filter((r) => {
      const isAC = r.beds.some((b) => b.is_premium);
      return acFilter === 'AC' ? isAC : !isAC;
    });
  }

  useEffect(() => {
    if (hostel?.floors[0] && !selectedFloor) setSelectedFloor(hostel.floors[0].floor);
  }, [hostel, selectedFloor]);

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

  const renderRoom = (r: Room, doorPos: 'left' | 'right' | 'top' | 'bottom') => {
    return (
      <div key={r.room_number} className="relative flex h-[104px] w-[136px] items-center justify-center rounded-2xl border-4 border-slate-300 bg-white shadow-sm transition-all hover:shadow-md flex-shrink-0 z-10">
        <span className="pointer-events-none absolute z-0 select-none text-2xl font-black text-slate-100">{r.room_number}</span>
        
        {/* Door */}
        {doorPos === 'left' && (
          <div className="absolute top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-100 shadow-inner -left-2" title="Room Entry">
            <div className="absolute top-0 h-10 w-6 border-y-2 border-amber-300/50 left-0 border-r-2 rounded-r-full border-dashed opacity-50"></div>
          </div>
        )}
        {doorPos === 'right' && (
          <div className="absolute top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-100 shadow-inner -right-2" title="Room Entry">
            <div className="absolute top-0 h-10 w-6 border-y-2 border-amber-300/50 right-0 border-l-2 rounded-l-full border-dashed opacity-50"></div>
          </div>
        )}
        {doorPos === 'top' && (
          <div className="absolute left-1/2 w-10 h-2 -translate-x-1/2 bg-amber-100 shadow-inner -top-2" title="Room Entry">
            <div className="absolute left-0 w-10 h-6 border-x-2 border-amber-300/50 top-0 border-b-2 rounded-b-full border-dashed opacity-50"></div>
          </div>
        )}
        {doorPos === 'bottom' && (
          <div className="absolute left-1/2 w-10 h-2 -translate-x-1/2 bg-amber-100 shadow-inner -bottom-2" title="Room Entry">
            <div className="absolute left-0 w-10 h-6 border-x-2 border-amber-300/50 bottom-0 border-t-2 rounded-t-full border-dashed opacity-50"></div>
          </div>
        )}

        {/* Beds */}
        {r.beds.map((b, i) => {
          const isAvailable = b.display_status === 'AVAILABLE';
          const isInCart = b.display_status === 'IN_CART';
          const isOccupied = b.display_status === 'BOOKED';
          let seatClass = 'absolute flex h-8 w-8 items-center justify-center rounded-md font-bold text-[10px] transition-all disabled:opacity-80 disabled:cursor-not-allowed z-10';
          if (isOccupied) seatClass += ' border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed';
          else if (isInCart) seatClass += ' bg-amber-400 text-sgvu-navy shadow-sm ring-2 ring-amber-400/50 ring-offset-1';
          else if (b.is_premium) seatClass += ' border border-sgvu-gold bg-amber-50 text-amber-700 hover:bg-amber-100 shadow-sm cursor-pointer hover:-translate-y-0.5 hover:shadow-md';
          else seatClass += ' border border-blue-300 bg-blue-50 text-blue-600 hover:bg-blue-100 shadow-sm cursor-pointer hover:-translate-y-0.5 hover:shadow-md hover:border-blue-400';
          
          const positions = ['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'];
          seatClass += ` ${positions[i] ?? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}`;
          return (
            <button key={b.bed_id} disabled={!isAvailable || locking} onClick={() => selectBed(b.bed_id)} className={seatClass} title={`Room ${r.room_number}, Bed ${b.bed_number}`}>
              {isOccupied ? 'X' : b.bed_number.split('-')[1] || b.bed_number}
              {b.is_premium && !isOccupied && <span className="absolute -top-1 -right-1 text-[8px] bg-sgvu-gold text-white rounded-full h-3 w-3 flex items-center justify-center shadow-sm">★</span>}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Hostel Bed Booking"
        description="Pick your hostel and floor. Then select an available bed from the floor map below."
      />

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" /></div>
      ) : saleActive === false ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Hostel bed booking is closed. The Chief Warden will open sales when rooms are available.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Controls: Hostels & Floors */}
          <div className="space-y-5">
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Hostel</span>
              <div className="flex flex-wrap gap-2">
                {catalog.map(h => (
                   <button
                     key={h.hostel_block}
                     onClick={() => {
                        setSelectedHostel(h.hostel_block);
                        setSelectedFloor('');
                     }}
                     className={`px-5 py-2.5 rounded-full text-sm font-semibold border transition-all shadow-sm ${
                       selectedHostel === h.hostel_block 
                         ? 'bg-sgvu-navy text-white border-sgvu-navy ring-2 ring-sgvu-navy/20 ring-offset-1' 
                         : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                     }`}
                   >
                     {h.hostel_block}
                   </button>
                ))}
              </div>
            </div>

            {hostel?.floors && hostel.floors.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Floor</span>
                  <div className="flex flex-wrap gap-2">
                    {hostel.floors.map(f => (
                       <button
                         key={f.floor}
                         onClick={() => setSelectedFloor(f.floor)}
                         className={`px-5 py-2.5 rounded-full text-sm font-semibold border transition-all shadow-sm ${
                           selectedFloor === f.floor 
                             ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-600/20 ring-offset-1' 
                             : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                         }`}
                       >
                         {f.floor}
                       </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200">
                    <button onClick={() => setRoomTypeFilter('ALL')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${roomTypeFilter === 'ALL' ? 'bg-white shadow-sm text-sgvu-navy' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
                    <button onClick={() => setRoomTypeFilter('1')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${roomTypeFilter === '1' ? 'bg-white shadow-sm text-sgvu-navy' : 'text-slate-500 hover:text-slate-700'}`}>1 Bed</button>
                    <button onClick={() => setRoomTypeFilter('2')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${roomTypeFilter === '2' ? 'bg-white shadow-sm text-sgvu-navy' : 'text-slate-500 hover:text-slate-700'}`}>2 Beds</button>
                    <button onClick={() => setRoomTypeFilter('3')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${roomTypeFilter === '3' ? 'bg-white shadow-sm text-sgvu-navy' : 'text-slate-500 hover:text-slate-700'}`}>3 Beds</button>
                  </div>

                  <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200">
                    <button onClick={() => setAcFilter('ALL')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${acFilter === 'ALL' ? 'bg-white shadow-sm text-sgvu-navy' : 'text-slate-500 hover:text-slate-700'}`}>All</button>
                    <button onClick={() => setAcFilter('AC')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${acFilter === 'AC' ? 'bg-white shadow-sm text-sgvu-navy' : 'text-slate-500 hover:text-slate-700'}`}>AC</button>
                    <button onClick={() => setAcFilter('NON_AC')} className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${acFilter === 'NON_AC' ? 'bg-white shadow-sm text-sgvu-navy' : 'text-slate-500 hover:text-slate-700'}`}>Non-AC</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Seat Layout Map */}
          {floor && floor.rooms.length > 0 && (
             <Card className="bg-white/50 backdrop-blur-sm border-slate-200 overflow-hidden shadow-sm">
               <CardContent className="p-8 space-y-12 overflow-x-auto min-w-max">
                 
                 {/* Legend */}
                 <div className="flex justify-center flex-wrap gap-6 text-xs font-semibold text-slate-600 tracking-wide">
                   <div className="flex items-center gap-2">
                     <span className="flex h-6 w-6 items-center justify-center rounded border border-blue-300 bg-blue-50 text-blue-600">A</span>
                     Available
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="flex h-6 w-6 items-center justify-center rounded border border-sgvu-gold bg-amber-50 text-sgvu-gold relative">
                       A<span className="absolute -top-1.5 -right-1.5 text-[8px] bg-sgvu-gold text-white rounded-full h-3.5 w-3.5 flex items-center justify-center">★</span>
                     </span>
                     Premium / AC
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="flex h-6 w-6 items-center justify-center rounded bg-amber-400 text-sgvu-navy shadow-sm">A</span>
                     In Checkout
                   </div>
                   <div className="flex items-center gap-2">
                     <span className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400">X</span>
                     Occupied
                   </div>
                 </div>

                 {/* The Semantic Map */}
                 <div className="mx-auto mt-8 w-full max-w-[1100px] px-4 pb-12 overflow-x-auto">
                   <div className="flex min-w-[900px]">
                     
                     {/* LEFT WING (Vertical) */}
                     <div className="flex gap-4 border-r-8 border-slate-200 pr-6 relative">
                       {/* Outer Left */}
                       <div className="flex flex-col gap-4">
                         {/* Top Left Stairs & Washroom */}
                         <div className="h-28 w-[136px] border-4 border-slate-300 bg-slate-50 rounded-2xl flex flex-col overflow-hidden shadow-sm">
                           <div className="flex-1 border-b-2 border-slate-300 flex items-center justify-center bg-[repeating-linear-gradient(0deg,transparent,transparent_4px,#cbd5e1_4px,#cbd5e1_6px)]">
                             <span className="bg-slate-50 px-2 text-xs font-bold text-slate-500">STAIRS UP</span>
                           </div>
                           <div className="h-10 bg-blue-50/50 flex items-center justify-center">
                             <span className="text-[10px] font-bold text-blue-400">WASHROOM</span>
                           </div>
                         </div>
                         
                         {visibleRooms.filter(r => parseInt(r.room_number.slice(-2)) >= 5 && parseInt(r.room_number.slice(-2)) <= 10).map(r => renderRoom(r, 'right'))}
                         
                         {/* Main Entrance (Bottom Left) */}
                         <div className="h-28 w-[136px] border-x-4 border-t-4 border-emerald-300 bg-emerald-50 rounded-t-2xl flex flex-col items-center justify-center relative mt-4 shadow-sm">
                           <span className="text-sm font-black text-emerald-600 tracking-wider text-center leading-tight">MAIN<br/>ENTRANCE</span>
                           <div className="absolute -bottom-4 w-16 h-4 bg-emerald-200 rounded-full"></div>
                         </div>
                       </div>
                       
                       {/* Left Corridor */}
                       <div className="w-16 bg-slate-100 flex flex-col justify-center items-center shadow-inner rounded-full border-x border-slate-300 relative z-0">
                         <div className="h-full border-l-2 border-dashed border-slate-400"></div>
                       </div>
                       
                       {/* Inner Left */}
                       <div className="flex flex-col gap-4 pt-[136px] pb-32">
                         {visibleRooms.filter(r => parseInt(r.room_number.slice(-2)) >= 11 && parseInt(r.room_number.slice(-2)) <= 16).map(r => renderRoom(r, 'left'))}
                       </div>
                     </div>

                     {/* CENTER BLOCK (Top Wing + Courtyard + Bottom Wing) */}
                     <div className="flex flex-col flex-1 pl-6">
                       
                       {/* TOP WING (Horizontal) */}
                       <div className="flex flex-col gap-4 border-b-8 border-slate-200 pb-6 relative">
                         {/* Outer Top */}
                         <div className="flex gap-4 justify-center">
                           {visibleRooms.filter(r => parseInt(r.room_number.slice(-2)) >= 1 && parseInt(r.room_number.slice(-2)) <= 4).map(r => renderRoom(r, 'bottom'))}
                         </div>
                         {/* Top Corridor */}
                         <div className="h-16 bg-slate-100 shadow-inner rounded-full border-y border-slate-300 w-full flex items-center justify-center">
                            <div className="w-full border-t-2 border-dashed border-slate-400"></div>
                         </div>
                       </div>

                       {/* COURTYARD */}
                       <div className="flex-1 my-8 mx-4 min-h-[350px] rounded-3xl bg-emerald-50/50 border-4 border-dashed border-emerald-300 flex flex-col items-center justify-center shadow-inner relative overflow-hidden">
                         <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-400 to-transparent"></div>
                         <span className="text-5xl font-black text-emerald-800/20 tracking-[0.4em] uppercase z-10">Courtyard</span>
                         <span className="text-sm font-bold text-emerald-800/40 mt-3 z-10">Manikarnika Open Space</span>
                       </div>

                       {/* BOTTOM WING (Horizontal) */}
                       <div className="flex flex-col gap-4 border-t-8 border-slate-200 pt-6 relative">
                         {/* Inner Bottom */}
                         <div className="flex gap-4 justify-center">
                           {visibleRooms.filter(r => parseInt(r.room_number.slice(-2)) >= 22 && parseInt(r.room_number.slice(-2)) <= 25).map(r => renderRoom(r, 'top'))}
                         </div>
                         {/* Bottom Corridor */}
                         <div className="h-16 bg-slate-100 shadow-inner rounded-full border-y border-slate-300 w-full flex items-center justify-center">
                            <div className="w-full border-t-2 border-dashed border-slate-400"></div>
                         </div>
                         {/* Outer Bottom */}
                         <div className="flex gap-4 justify-center">
                           {visibleRooms.filter(r => parseInt(r.room_number.slice(-2)) >= 17 && parseInt(r.room_number.slice(-2)) <= 21).map(r => renderRoom(r, 'top'))}
                         </div>
                       </div>
                     </div>

                     {/* RIGHT WING (Amenities & Secondary Stairs) */}
                     <div className="flex flex-col gap-6 ml-10">
                       <div className="w-56 flex-1 border-8 border-slate-200 bg-slate-50 rounded-r-[3rem] rounded-l-2xl flex flex-col items-center justify-center relative shadow-sm">
                         <div className="h-full w-full flex items-center justify-center -rotate-90">
                            <span className="text-4xl font-black text-slate-300 tracking-[0.2em] whitespace-nowrap">COMMON ROOM</span>
                         </div>
                         <div className="absolute bottom-8 left-6 right-6 h-40 border-4 border-slate-200 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                           <span className="text-lg font-bold text-slate-400 tracking-wider">Kitchen / Dining</span>
                         </div>
                       </div>
                       
                       {/* Bottom Right Stairs & Washroom */}
                       <div className="h-28 w-56 border-4 border-slate-300 bg-slate-50 rounded-2xl flex overflow-hidden shadow-sm mt-auto mb-16">
                         <div className="flex-1 border-r-2 border-slate-300 flex items-center justify-center bg-[repeating-linear-gradient(0deg,transparent,transparent_4px,#cbd5e1_4px,#cbd5e1_6px)]">
                           <span className="bg-slate-50 px-2 text-xs font-bold text-slate-500 rotate-90">STAIRS</span>
                         </div>
                         <div className="w-20 bg-blue-50/50 flex items-center justify-center">
                           <span className="text-[10px] font-bold text-blue-400 -rotate-90">WASHROOM</span>
                         </div>
                       </div>
                     </div>

                   </div>
                 </div>
               </CardContent>
             </Card>
          )}
        </div>
      )}
    </StudentPageShell>
  );
}
