'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
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
type DoorPos = 'left' | 'right' | 'top' | 'bottom';
type FloorKind = 'ground' | 'first' | 'second';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const STAIR_HATCH =
  'bg-[repeating-linear-gradient(0deg,transparent,transparent_4px,#cbd5e1_4px,#cbd5e1_6px)]';

/** Scales the floor map to fill available width; height scrolls naturally so rooms stay readable. */
function FloorMapFit({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fittedHeight, setFittedHeight] = useState<number | undefined>();
  const [ready, setReady] = useState(false);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const availW = container.clientWidth;
    const natW = content.scrollWidth;
    const natH = content.scrollHeight;
    if (natW === 0 || natH === 0) return;

    // Fill horizontal space (upscale on wide screens, downscale on narrow). No height cap.
    const widthScale = (availW / natW) * 0.99;
    const nextScale = Math.max(0.52, Math.min(1.45, widthScale));

    setScale(nextScale);
    setFittedHeight(natH * nextScale);
    setReady(true);
  }, []);

  useLayoutEffect(() => {
    recalc();
  }, [recalc, children]);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener('resize', recalc);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recalc);
    };
  }, [recalc, children]);

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: fittedHeight }}>
      <div
        ref={contentRef}
        className="absolute left-1/2 top-0 w-max"
        style={{
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: 'top center',
          opacity: ready ? 1 : 0,
          transition: 'opacity 150ms ease',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function roomSuffix(roomNumber: string) {
  return parseInt(roomNumber.slice(-2), 10);
}

function inferRoomLabel(floorName: string, suffix: number) {
  const pad = String(suffix).padStart(2, '0');
  const lower = floorName.toLowerCase();
  if (lower.includes('ground')) return `G${pad}`;
  if (lower.includes('2nd') || lower.includes('second')) return `2${pad}`;
  return `1${pad}`;
}

function PlaceholderRoom({ label, doorPos }: { label: string; doorPos: DoorPos }) {
  return (
    <div
      className="relative z-10 flex h-[104px] w-[136px] flex-shrink-0 items-center justify-center rounded-2xl border-4 border-dashed border-slate-200 bg-slate-50/80 shadow-sm"
      title={`Room ${label} — not in catalog`}
    >
      <span className="text-lg font-black text-slate-200">{label}</span>
      {doorPos === 'left' && (
        <div className="absolute -left-2 top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-50 shadow-inner opacity-40" />
      )}
      {doorPos === 'right' && (
        <div className="absolute -right-2 top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-50 shadow-inner opacity-40" />
      )}
      {doorPos === 'top' && (
        <div className="absolute -top-2 left-1/2 h-2 w-10 -translate-x-1/2 bg-amber-50 shadow-inner opacity-40" />
      )}
      {doorPos === 'bottom' && (
        <div className="absolute -bottom-2 left-1/2 h-2 w-10 -translate-x-1/2 bg-amber-50 shadow-inner opacity-40" />
      )}
    </div>
  );
}

function FilteredRoomShell({ room, doorPos }: { room: Room; doorPos: DoorPos }) {
  return (
    <div
      className="relative z-10 flex h-[104px] w-[136px] flex-shrink-0 items-center justify-center rounded-2xl border-4 border-slate-200 bg-slate-50 opacity-50 shadow-sm"
      title={`Room ${room.room_number} hidden by filter`}
    >
      <span className="text-2xl font-black text-slate-200">{room.room_number}</span>
      {doorPos === 'left' && <div className="absolute -left-2 top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-50 opacity-30" />}
      {doorPos === 'right' && <div className="absolute -right-2 top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-50 opacity-30" />}
      {doorPos === 'top' && <div className="absolute -top-2 left-1/2 h-2 w-10 -translate-x-1/2 bg-amber-50 opacity-30" />}
      {doorPos === 'bottom' && (
        <div className="absolute -bottom-2 left-1/2 h-2 w-10 -translate-x-1/2 bg-amber-50 opacity-30" />
      )}
    </div>
  );
}

function wingSlots(min: number, max: number) {
  return Array.from({ length: max - min + 1 }, (_, i) => min + i);
}

function getFloorKind(floorName: string): FloorKind {
  const lower = floorName.toLowerCase();
  if (lower.includes('ground')) return 'ground';
  if (lower.includes('2nd') || lower.includes('second')) return 'second';
  return 'first';
}

function Staircase({
  label = 'STAIRS UP',
  className = '',
  vertical = false,
}: {
  label?: string;
  className?: string;
  vertical?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center rounded-2xl border-4 border-slate-300 bg-slate-50 shadow-sm ${STAIR_HATCH} ${className}`}
    >
      <span
        className={`bg-slate-50 px-2 text-xs font-bold text-slate-500 ${vertical ? '-rotate-90 whitespace-nowrap' : ''}`}
      >
        {label}
      </span>
    </div>
  );
}

function WashroomBlock({ className = '', label = 'TOILET' }: { className?: string; label?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border-2 border-blue-200 bg-blue-50/70 shadow-sm ${className}`}
    >
      <span className="text-[9px] font-bold uppercase tracking-wide text-blue-400">{label}</span>
    </div>
  );
}

function ServiceBlock({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl border-2 border-slate-200 bg-slate-100 shadow-sm ${className}`}
    >
      <span className="px-1 text-center text-[9px] font-bold uppercase tracking-wide text-slate-500">
        {label}
      </span>
    </div>
  );
}

function MainEntrance({ className = '' }: { className?: string }) {
  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-t-2xl border-x-4 border-t-4 border-emerald-300 bg-emerald-50 shadow-sm ${className}`}
    >
      <span className="text-center text-sm font-black leading-tight tracking-wider text-emerald-600">
        MAIN
        <br />
        ENTRANCE
      </span>
      <div className="absolute -bottom-3 h-3 w-16 rounded-full bg-emerald-200" />
    </div>
  );
}

function CurvedAmenity({
  label,
  sublabel,
  className = '',
}: {
  label: string;
  sublabel?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-l-2xl rounded-r-[3rem] border-4 border-slate-300 bg-slate-50 shadow-sm ${className}`}
    >
      <div className="-rotate-90 text-center">
        <span className="block whitespace-nowrap text-2xl font-black tracking-[0.15em] text-slate-300">
          {label}
        </span>
        {sublabel && <span className="mt-1 block text-[10px] font-bold tracking-wider text-slate-400">{sublabel}</span>}
      </div>
    </div>
  );
}

function BlueprintBlock({
  children,
  className = '',
  style,
}: {
  children: ReactNode;
  className?: string;
  style: React.CSSProperties;
}) {
  return (
    <div className={`absolute ${className}`} style={style}>
      {children}
    </div>
  );
}

function BlueprintCorridor({
  label,
  orientation,
  className = '',
  style,
}: {
  label: string;
  orientation: 'horizontal' | 'vertical';
  className?: string;
  style: React.CSSProperties;
}) {
  const isHorizontal = orientation === 'horizontal';
  return (
    <BlueprintBlock
      style={style}
      className={`flex items-center justify-center border border-slate-300 bg-slate-100 shadow-inner ${className}`}
    >
      {isHorizontal ? (
        <div className="absolute inset-x-4 top-1/2 border-t-2 border-dashed border-slate-400" />
      ) : (
        <div className="absolute inset-y-4 left-1/2 border-l-2 border-dashed border-slate-400" />
      )}
      <span
        className={`relative z-10 rounded bg-slate-100 px-1.5 text-[8px] font-bold uppercase tracking-wider text-slate-400 ${
          isHorizontal ? '' : '-rotate-90 whitespace-nowrap'
        }`}
      >
        {label}
      </span>
    </BlueprintBlock>
  );
}

function BlueprintToilet({
  label = 'TOILET',
  style,
  className = '',
}: {
  label?: string;
  style: React.CSSProperties;
  className?: string;
}) {
  return (
    <BlueprintBlock style={style} className={className}>
      <WashroomBlock className="h-full w-full rounded-md" label={label} />
    </BlueprintBlock>
  );
}

function BlueprintService({
  label,
  style,
  className = '',
}: {
  label: string;
  style: React.CSSProperties;
  className?: string;
}) {
  return (
    <BlueprintBlock style={style} className={className}>
      <ServiceBlock label={label} className="h-full w-full" />
    </BlueprintBlock>
  );
}

function BlueprintRoomSlot({
  suffix,
  doorPos,
  floorName,
  roomBySuffix,
  visibleNumbers,
  renderRoom,
  style,
}: {
  suffix: number;
  doorPos: DoorPos;
  floorName: string;
  roomBySuffix: Map<number, Room>;
  visibleNumbers: Set<string>;
  renderRoom: (r: Room, doorPos: DoorPos) => ReactNode;
  style: React.CSSProperties;
}) {
  const room = roomBySuffix.get(suffix);
  const content =
    room && visibleNumbers.has(room.room_number) ? (
      renderRoom(room, doorPos)
    ) : room ? (
      <FilteredRoomShell room={room} doorPos={doorPos} />
    ) : (
      <PlaceholderRoom label={inferRoomLabel(floorName, suffix)} doorPos={doorPos} />
    );

  return <BlueprintBlock style={style}>{content}</BlueprintBlock>;
}

function BlueprintRoomWithToilet({
  suffix,
  doorPos,
  toilet,
  floorName,
  roomBySuffix,
  visibleNumbers,
  renderRoom,
  style,
}: {
  suffix: number;
  doorPos: DoorPos;
  toilet: 'left' | 'right' | 'top' | 'bottom';
  floorName: string;
  roomBySuffix: Map<number, Room>;
  visibleNumbers: Set<string>;
  renderRoom: (r: Room, doorPos: DoorPos) => ReactNode;
  style: React.CSSProperties;
}) {
  const toiletStyle =
    toilet === 'left'
      ? { left: -26, top: 30, width: 24, height: 44 }
      : toilet === 'right'
        ? { right: -26, top: 30, width: 24, height: 44 }
        : toilet === 'top'
          ? { left: 42, top: -24, width: 52, height: 22 }
          : { left: 42, bottom: -24, width: 52, height: 22 };

  return (
    <BlueprintBlock style={style}>
      <BlueprintRoomSlot
        suffix={suffix}
        doorPos={doorPos}
        floorName={floorName}
        roomBySuffix={roomBySuffix}
        visibleNumbers={visibleNumbers}
        renderRoom={renderRoom}
        style={{ left: 0, top: 0 }}
      />
      <BlueprintToilet style={toiletStyle} />
    </BlueprintBlock>
  );
}

function HostelFloorMap({
  floorName,
  allRooms,
  visibleRooms,
  floorKind,
  renderRoom,
}: {
  floorName: string;
  allRooms: Room[];
  visibleRooms: Room[];
  floorKind: FloorKind;
  renderRoom: (r: Room, doorPos: DoorPos) => ReactNode;
}) {
  const roomBySuffix = new Map(allRooms.map((r) => [roomSuffix(r.room_number), r]));
  const visibleNumbers = new Set(visibleRooms.map((r) => r.room_number));

  const roomWithToilet = (
    suffix: number,
    doorPos: DoorPos,
    toilet: 'left' | 'right' | 'top' | 'bottom',
    style: React.CSSProperties,
  ) => (
    <BlueprintRoomWithToilet
      key={`room-toilet-${suffix}`}
      suffix={suffix}
      doorPos={doorPos}
      toilet={toilet}
      floorName={floorName}
      roomBySuffix={roomBySuffix}
      visibleNumbers={visibleNumbers}
      renderRoom={renderRoom}
      style={style}
    />
  );

  const northService =
    floorKind === 'ground'
      ? [
          <BlueprintService key="wash" label="Washing Room" style={{ left: 730, top: 36, width: 118, height: 104 }} />,
          <BlueprintService key="porch" label="Porch" style={{ left: 944, top: 14, width: 108, height: 148 }} className="border-dashed" />,
        ]
      : floorKind === 'first'
        ? [
            <BlueprintService key="waiting" label="Waiting Room" style={{ left: 730, top: 36, width: 118, height: 104 }} />,
            <BlueprintService key="bridge" label="Bridge" style={{ left: 850, top: 20, width: 92, height: 128 }} />,
            <BlueprintService key="porch" label="Porch" style={{ left: 944, top: 14, width: 108, height: 148 }} className="border-dashed" />,
          ]
        : [
            <BlueprintService key="overhead" label="Overhead" style={{ left: 730, top: 36, width: 118, height: 104 }} />,
            <BlueprintService key="terrace" label="Open Terrace" style={{ left: 850, top: 20, width: 202, height: 128 }} className="border-dashed" />,
          ];

  return (
    <div className="pb-4">
      <div className="relative h-[980px] w-[1320px] rounded-2xl border-2 border-slate-200 bg-white shadow-sm">
        {/* structural wall/voids */}
        <BlueprintBlock
          style={{ left: 310, top: 220, width: 550, height: 520 }}
          className="flex flex-col items-center justify-center overflow-hidden border-4 border-dashed border-emerald-300 bg-emerald-50/50 shadow-inner"
        >
          <div className="pointer-events-none absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-400 to-transparent" />
          <span className="relative z-10 text-5xl font-black uppercase tracking-[0.35em] text-emerald-800/20">
            Courtyard
          </span>
          <span className="relative z-10 mt-2 text-sm font-bold text-emerald-800/40">
            Manikarnika Open Space · 60&apos; × 60&apos;
          </span>
        </BlueprintBlock>

        <BlueprintCorridor label="6' corridor" orientation="horizontal" style={{ left: 70, top: 162, width: 790, height: 54 }} className="rounded-sm" />
        <BlueprintCorridor label="6' corridor" orientation="vertical" style={{ left: 178, top: 220, width: 54, height: 520 }} className="rounded-sm" />
        <BlueprintCorridor label="6' corridor" orientation="vertical" style={{ left: 864, top: 162, width: 54, height: 578 }} className="rounded-sm" />
        <BlueprintCorridor label="6' corridor" orientation="horizontal" style={{ left: 178, top: 744, width: 682, height: 54 }} className="rounded-sm" />
        <BlueprintCorridor label="6' wide passage" orientation="horizontal" style={{ left: 66, top: 818, width: 792, height: 42 }} className="rounded-sm" />

        <BlueprintBlock style={{ left: 28, top: 26, width: 136, height: 128 }}>
          <Staircase className="h-full w-full rounded-sm" />
        </BlueprintBlock>
        <BlueprintBlock style={{ left: 50, top: 704, width: 136, height: 120 }}>
          <MainEntrance className="h-full w-full rounded-sm" />
        </BlueprintBlock>
        <BlueprintService label={floorKind === 'ground' ? 'Store / Office' : 'Pergola / Open'} style={{ left: 28, top: 820, width: 136, height: 128 }} />

        {wingSlots(1, 4).map((suffix, i) =>
          roomWithToilet(suffix, 'bottom', 'bottom', { left: 210 + i * 132, top: 36 }),
        )}
        {northService}

        {wingSlots(5, 10).map((suffix, i) =>
          roomWithToilet(suffix, 'right', 'right', { left: 28, top: 230 + i * 78 }),
        )}
        {wingSlots(11, 16).map((suffix, i) =>
          roomWithToilet(suffix, 'left', 'left', { left: 240, top: 230 + i * 78 }),
        )}

        {wingSlots(17, 20).map((suffix, i) =>
          roomWithToilet(suffix, 'bottom', 'bottom', { left: 376 + i * 132, top: 612 }),
        )}
        {wingSlots(21, 25).map((suffix, i) =>
          roomWithToilet(suffix, 'top', 'top', { left: 192 + i * 132, top: 872 }),
        )}

        {floorKind === 'ground' && (
          <>
            <BlueprintService label="Porch" style={{ left: 934, top: 32, width: 116, height: 128 }} className="border-dashed" />
            <BlueprintBlock style={{ left: 936, top: 384, width: 260, height: 184 }}>
              <CurvedAmenity label="Dining Hall" sublabel="40' × 20'" className="h-full w-full bg-white" />
            </BlueprintBlock>
            <BlueprintService label="Kitchen" style={{ left: 936, top: 570, width: 200, height: 150 }} className="bg-white" />
            <BlueprintService label="Store" style={{ left: 936, top: 724, width: 90, height: 54 }} />
            <BlueprintToilet label="Wash" style={{ left: 1032, top: 724, width: 70, height: 54 }} />
          </>
        )}

        {floorKind === 'first' && (
          <>
            <BlueprintService label="Bridge" style={{ left: 934, top: 32, width: 116, height: 128 }} />
            <BlueprintBlock style={{ left: 936, top: 382, width: 260, height: 190 }}>
              <CurvedAmenity label="Common Room" sublabel="40' 6&quot; × 28' 5&quot;" className="h-full w-full" />
            </BlueprintBlock>
            <BlueprintService label="Room" style={{ left: 936, top: 574, width: 200, height: 146 }} className="bg-white" />
            <BlueprintToilet style={{ left: 936, top: 724, width: 90, height: 54 }} />
          </>
        )}

        {floorKind === 'second' && (
          <>
            <BlueprintService label="Overhead" style={{ left: 934, top: 32, width: 116, height: 128 }} />
            <BlueprintService
              label="Open Terrace"
              style={{ left: 936, top: 306, width: 260, height: 360 }}
              className="rounded-r-[4rem] border-dashed bg-sky-50/60"
            />
            <BlueprintToilet style={{ left: 936, top: 724, width: 90, height: 54 }} />
          </>
        )}

        <BlueprintBlock style={{ left: 936, top: 786, width: 150, height: 104 }}>
          <Staircase label="STAIRS" className="h-full w-full rounded-sm" />
        </BlueprintBlock>
        <BlueprintToilet style={{ left: 1092, top: 786, width: 72, height: 104 }} />
      </div>
    </div>
  );
}

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
  const floorKind = getFloorKind(selectedFloor);

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

  const renderRoom = (r: Room, doorPos: DoorPos) => {
    return (
      <div
        key={r.room_number}
        className="relative z-10 flex h-[104px] w-[136px] flex-shrink-0 items-center justify-center rounded-2xl border-4 border-slate-300 bg-white shadow-sm transition-all hover:shadow-md"
      >
        <span className="pointer-events-none absolute z-0 select-none text-2xl font-black text-slate-100">
          {r.room_number}
        </span>

        {doorPos === 'left' && (
          <div className="absolute -left-2 top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-100 shadow-inner" title="Room Entry">
            <div className="absolute left-0 top-0 h-10 w-6 rounded-r-full border-y-2 border-r-2 border-dashed border-amber-300/50 opacity-50" />
          </div>
        )}
        {doorPos === 'right' && (
          <div className="absolute -right-2 top-1/2 h-10 w-2 -translate-y-1/2 bg-amber-100 shadow-inner" title="Room Entry">
            <div className="absolute right-0 top-0 h-10 w-6 rounded-l-full border-y-2 border-l-2 border-dashed border-amber-300/50 opacity-50" />
          </div>
        )}
        {doorPos === 'top' && (
          <div className="absolute -top-2 left-1/2 h-2 w-10 -translate-x-1/2 bg-amber-100 shadow-inner" title="Room Entry">
            <div className="absolute left-0 top-0 h-6 w-10 rounded-b-full border-x-2 border-b-2 border-dashed border-amber-300/50 opacity-50" />
          </div>
        )}
        {doorPos === 'bottom' && (
          <div className="absolute -bottom-2 left-1/2 h-2 w-10 -translate-x-1/2 bg-amber-100 shadow-inner" title="Room Entry">
            <div className="absolute bottom-0 left-0 h-6 w-10 rounded-t-full border-x-2 border-t-2 border-dashed border-amber-300/50 opacity-50" />
          </div>
        )}

        {r.beds.map((b, i) => {
          const isAvailable = b.display_status === 'AVAILABLE';
          const isInCart = b.display_status === 'IN_CART';
          const isOccupied = b.display_status === 'BOOKED';
          let seatClass =
            'absolute z-10 flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-bold transition-all disabled:cursor-not-allowed disabled:opacity-80';
          if (isOccupied) seatClass += ' cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400';
          else if (isInCart) seatClass += ' bg-amber-400 text-sgvu-navy shadow-sm ring-2 ring-amber-400/50 ring-offset-1';
          else if (b.is_premium)
            seatClass +=
              ' cursor-pointer border border-sgvu-gold bg-amber-50 text-amber-700 shadow-sm hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-md';
          else
            seatClass +=
              ' cursor-pointer border border-blue-300 bg-blue-50 text-blue-600 shadow-sm hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-100 hover:shadow-md';

          const positions = ['top-2 left-2', 'top-2 right-2', 'bottom-2 left-2', 'bottom-2 right-2'];
          seatClass += ` ${positions[i] ?? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'}`;
          return (
            <button
              key={b.bed_id}
              disabled={!isAvailable || locking}
              onClick={() => selectBed(b.bed_id)}
              className={seatClass}
              title={`Room ${r.room_number}, Bed ${b.bed_number}`}
            >
              {isOccupied ? 'X' : b.bed_number.split('-')[1] || b.bed_number}
              {b.is_premium && !isOccupied && (
                <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-sgvu-gold text-[8px] text-white shadow-sm">
                  ★
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <StudentPageShell width="full">
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
          <div className="space-y-5">
            <div className="flex flex-col gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Hostel</span>
              <div className="flex flex-wrap gap-2">
                {catalog.map((h) => (
                  <button
                    key={h.hostel_block}
                    onClick={() => {
                      setSelectedHostel(h.hostel_block);
                      setSelectedFloor('');
                    }}
                    className={`rounded-full border px-5 py-2.5 text-sm font-semibold shadow-sm transition-all ${
                      selectedHostel === h.hostel_block
                        ? 'border-sgvu-navy bg-sgvu-navy text-white ring-2 ring-sgvu-navy/20 ring-offset-1'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {h.hostel_block}
                  </button>
                ))}
              </div>
            </div>

            {hostel?.floors && hostel.floors.length > 0 && (
              <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div className="flex flex-col gap-2.5">
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Floor</span>
                  <div className="flex flex-wrap gap-2">
                    {hostel.floors.map((f) => (
                      <button
                        key={f.floor}
                        onClick={() => setSelectedFloor(f.floor)}
                        className={`rounded-full border px-5 py-2.5 text-sm font-semibold shadow-sm transition-all ${
                          selectedFloor === f.floor
                            ? 'border-blue-600 bg-blue-600 text-white ring-2 ring-blue-600/20 ring-offset-1'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {f.floor}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex rounded-full border border-slate-200 bg-slate-100 p-1">
                    <button
                      onClick={() => setRoomTypeFilter('ALL')}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${roomTypeFilter === 'ALL' ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setRoomTypeFilter('1')}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${roomTypeFilter === '1' ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      1 Bed
                    </button>
                    <button
                      onClick={() => setRoomTypeFilter('2')}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${roomTypeFilter === '2' ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      2 Beds
                    </button>
                    <button
                      onClick={() => setRoomTypeFilter('3')}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${roomTypeFilter === '3' ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      3 Beds
                    </button>
                  </div>

                  <div className="flex rounded-full border border-slate-200 bg-slate-100 p-1">
                    <button
                      onClick={() => setAcFilter('ALL')}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${acFilter === 'ALL' ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setAcFilter('AC')}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${acFilter === 'AC' ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      AC
                    </button>
                    <button
                      onClick={() => setAcFilter('NON_AC')}
                      className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${acFilter === 'NON_AC' ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      Non-AC
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {floor && (
            <Card className="border-slate-200 bg-white/50 shadow-sm backdrop-blur-sm">
              <CardContent className="space-y-4 p-3 md:p-4">
                <div className="flex flex-wrap justify-center gap-3 text-xs font-semibold tracking-wide text-slate-600">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded border border-blue-300 bg-blue-50 text-blue-600">
                      A
                    </span>
                    Available
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-6 w-6 items-center justify-center rounded border border-sgvu-gold bg-amber-50 text-sgvu-gold">
                      A
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-sgvu-gold text-[8px] text-white">
                        ★
                      </span>
                    </span>
                    Premium / AC
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-amber-400 text-sgvu-navy shadow-sm">
                      A
                    </span>
                    In Checkout
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400">
                      X
                    </span>
                    Occupied
                  </div>
                </div>

                <FloorMapFit>
                  <HostelFloorMap
                    floorName={selectedFloor}
                    allRooms={floor.rooms}
                    visibleRooms={visibleRooms}
                    floorKind={floorKind}
                    renderRoom={renderRoom}
                  />
                </FloorMapFit>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </StudentPageShell>
  );
}
