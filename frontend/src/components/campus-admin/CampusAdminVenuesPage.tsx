'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  Building2,
  CalendarDays,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { useAuthedApi } from '@/lib/api';

type VenueRow = {
  venue_id: string;
  name: string;
  capacity?: number | null;
  amenities?: string[] | unknown;
  is_bookable_by_students?: boolean | null;
  approver_role?: string | null;
  max_duration_mins?: number | null;
  created_at?: string | null;
  booking_count?: number | null;
  pending_count?: number | null;
  approved_count?: number | null;
};

type VenueDetailResponse = {
  venue: VenueRow;
  bookings: Array<{
    booking_id?: string;
    start_time?: string | null;
    end_time?: string | null;
    purpose?: string | null;
    status?: string | null;
    approver_remarks?: string | null;
    student_name?: string | null;
    student_email?: string | null;
  }>;
};

type VenueMode = 'classrooms' | 'facilities';

function parseAmenities(value: VenueRow['amenities']): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item)).filter(Boolean)
        : [];
    } catch {
      return value.trim() ? [value] : [];
    }
  }
  return [];
}

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(mins?: number | null) {
  if (mins == null || Number.isNaN(Number(mins))) return '—';
  const value = Number(mins);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rem = value % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function formatApprover(role?: string | null) {
  if (!role) return '—';
  return role
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusBadge(status?: string | null) {
  const key = String(status ?? '').toUpperCase();
  if (key === 'APPROVED') return <Badge variant="success">Approved</Badge>;
  if (key === 'PENDING_APPROVAL') return <Badge variant="warning">Pending</Badge>;
  if (key === 'REJECTED') return <Badge variant="destructive">Rejected</Badge>;
  if (key === 'CANCELLED' || key === 'EXPIRED') {
    return <Badge variant="secondary">{key.replace(/_/g, ' ')}</Badge>;
  }
  return <Badge variant="outline">{status || '—'}</Badge>;
}

function parseApiError(err: unknown) {
  if (!(err instanceof Error)) return 'Something went wrong';
  try {
    const parsed = JSON.parse(err.message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(', ');
    if (parsed.message) return parsed.message;
  } catch {
    /* plain text */
  }
  return err.message;
}

export function CampusAdminVenuesPage({ mode }: { mode: VenueMode }) {
  const api = useAuthedApi();
  const isClassrooms = mode === 'classrooms';
  const listPath = isClassrooms
    ? '/api/campus-admin/classrooms'
    : '/api/campus-admin/facilities';
  const detailPath = (id: string) =>
    isClassrooms
      ? `/api/campus-admin/classrooms/${id}`
      : `/api/campus-admin/facilities/${id}`;

  const [rows, setRows] = useState<VenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [bookable, setBookable] = useState<'all' | 'yes' | 'no'>('all');
  const [capacityBand, setCapacityBand] = useState<'all' | 'small' | 'medium' | 'large'>(
    'all',
  );
  const [viewRow, setViewRow] = useState<VenueRow | null>(null);
  const [detail, setDetail] = useState<VenueDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<VenueRow[]>(listPath);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      setError(parseApiError(err) || 'Unable to load venues for your campus.');
    } finally {
      setLoading(false);
    }
  }, [api, listPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!viewRow) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    void api
      .get<VenueDetailResponse>(detailPath(viewRow.venue_id))
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setDetail(null);
          setDetailError(parseApiError(err) || 'Unable to load venue details.');
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, viewRow]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((row) => {
      if (bookable === 'yes' && !row.is_bookable_by_students) return false;
      if (bookable === 'no' && row.is_bookable_by_students) return false;
      const capacity = Number(row.capacity ?? 0);
      if (capacityBand === 'small' && capacity > 20) return false;
      if (capacityBand === 'medium' && (capacity <= 20 || capacity > 80)) return false;
      if (capacityBand === 'large' && capacity <= 80) return false;
      if (!term) return true;
      const amenities = parseAmenities(row.amenities).join(' ');
      return `${row.name} ${row.approver_role ?? ''} ${amenities}`
        .toLowerCase()
        .includes(term);
    });
  }, [bookable, capacityBand, q, rows]);

  const stats = useMemo(() => {
    const bookableCount = rows.filter((row) => row.is_bookable_by_students).length;
    const totalCapacity = rows.reduce((sum, row) => sum + Number(row.capacity ?? 0), 0);
    const pending = rows.reduce((sum, row) => sum + Number(row.pending_count ?? 0), 0);
    return {
      total: rows.length,
      bookable: bookableCount,
      capacity: totalCapacity,
      pending,
    };
  }, [rows]);

  const title = isClassrooms ? 'Buildings & Classrooms' : 'Facilities & Venues';
  const subtitle = isClassrooms
    ? 'Teaching rooms and campus venues linked to timetable and bookings.'
    : 'Bookable campus facilities from the venues register, with approval and capacity details.';

  return (
    <div className="space-y-5 p-6">
      <Card className="overflow-hidden border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="relative p-5 md:p-6">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_80%_20%,rgba(214,169,69,0.14),transparent_55%)]" />
          <div className="relative space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              Campus Admin
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-sgvu-navy">{title}</h1>
            <p className="max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
            {isClassrooms ? (
              <div className="pt-1">
                <Button asChild variant="outline" size="sm" className="h-8">
                  <Link href={campusAdminRoutes.academicsTimetable}>Open timetable</Link>
                </Button>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label={isClassrooms ? 'Rooms' : 'Facilities'}
          value={stats.total}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Total capacity"
          value={stats.capacity}
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Student bookable"
          value={stats.bookable}
        />
        <StatCard
          icon={<CalendarDays className="h-4 w-4" />}
          label="Pending bookings"
          value={stats.pending}
        />
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  isClassrooms
                    ? 'Search room, amenity, or approver…'
                    : 'Search facility, amenity, or approver…'
                }
                className="h-10 rounded-xl border-gray-200 bg-white pl-9"
              />
            </div>
            <Select
              value={bookable}
              onChange={(e) => setBookable(e.target.value as 'all' | 'yes' | 'no')}
              className="h-10 w-full rounded-xl border-gray-200 bg-white lg:w-44"
            >
              <option value="all">All bookable</option>
              <option value="yes">Student bookable</option>
              <option value="no">Staff / internal</option>
            </Select>
            <Select
              value={capacityBand}
              onChange={(e) =>
                setCapacityBand(e.target.value as 'all' | 'small' | 'medium' | 'large')
              }
              className="h-10 w-full rounded-xl border-gray-200 bg-white lg:w-44"
            >
              <option value="all">All capacities</option>
              <option value="small">Small (≤20)</option>
              <option value="medium">Medium (21–80)</option>
              <option value="large">Large (80+)</option>
            </Select>
          </div>

          {loading ? (
            <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading {isClassrooms ? 'classrooms' : 'facilities'}…
            </p>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No {isClassrooms ? 'classrooms' : 'facilities'} match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-sgvu-navy/10">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="p-3 font-semibold">
                      {isClassrooms ? 'Room / venue' : 'Facility'}
                    </th>
                    <th className="p-3 font-semibold">Capacity</th>
                    <th className="p-3 font-semibold">Max duration</th>
                    <th className="p-3 font-semibold">Student bookable</th>
                    <th className="p-3 font-semibold">Approver</th>
                    <th className="p-3 font-semibold">Bookings</th>
                    <th className="p-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((row) => {
                    const amenities = parseAmenities(row.amenities);
                    return (
                      <tr key={row.venue_id} className="hover:bg-muted/20">
                        <td className="p-3">
                          <button
                            type="button"
                            className="text-left font-semibold text-sgvu-navy hover:underline"
                            onClick={() => setViewRow(row)}
                          >
                            {row.name}
                          </button>
                          {amenities.length ? (
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {amenities.slice(0, 3).join(' · ')}
                              {amenities.length > 3 ? ` +${amenities.length - 3}` : ''}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-3 font-medium text-sgvu-navy">
                          {row.capacity ?? '—'}
                        </td>
                        <td className="p-3">{formatDuration(row.max_duration_mins)}</td>
                        <td className="p-3">
                          {row.is_bookable_by_students ? (
                            <Badge variant="success">Yes</Badge>
                          ) : (
                            <Badge variant="secondary">No</Badge>
                          )}
                        </td>
                        <td className="p-3">{formatApprover(row.approver_role)}</td>
                        <td className="p-3">
                          <div className="space-y-0.5">
                            <p className="font-medium text-sgvu-navy">
                              {Number(row.booking_count ?? 0).toLocaleString('en-IN')}
                            </p>
                            {Number(row.pending_count ?? 0) > 0 ? (
                              <p className="text-xs text-amber-700">
                                {row.pending_count} pending
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                {Number(row.approved_count ?? 0)} approved
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => setViewRow(row)}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={Boolean(viewRow)} onOpenChange={(open) => !open && setViewRow(null)}>
        <SheetContent
          side="right"
          className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy"
        >
          {viewRow ? (
            <VenueDetailPanel
              fallback={viewRow}
              detail={detail}
              loading={detailLoading}
              error={detailError}
              mode={mode}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sgvu-navy/5 text-sgvu-navy">
          {icon}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-xl font-bold text-sgvu-navy">
            {Number(value).toLocaleString('en-IN')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function VenueDetailPanel({
  fallback,
  detail,
  loading,
  error,
  mode,
}: {
  fallback: VenueRow;
  detail: VenueDetailResponse | null;
  loading: boolean;
  error: string | null;
  mode: VenueMode;
}) {
  const venue = detail?.venue ?? fallback;
  const amenities = parseAmenities(venue.amenities);
  const initials = venue.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-sgvu-navy/10 px-6 pb-5 pr-14 pt-6 text-left">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sgvu-navy text-sm font-semibold text-white">
            {initials || 'VN'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">
              {mode === 'classrooms' ? 'Classroom' : 'Facility'}
            </p>
            <SheetTitle className="mt-1 text-xl font-bold leading-tight text-sgvu-navy">
              {venue.name}
            </SheetTitle>
            <SheetDescription className="mt-1 text-sm text-muted-foreground">
              {[
                venue.capacity != null ? `Capacity ${venue.capacity}` : null,
                formatApprover(venue.approver_role),
              ]
                .filter(Boolean)
                .join(' · ') || 'Full venue information'}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {venue.is_bookable_by_students ? (
                <Badge variant="success">Student bookable</Badge>
              ) : (
                <Badge variant="secondary">Not student bookable</Badge>
              )}
              <Badge variant="outline">{formatDuration(venue.max_duration_mins)}</Badge>
            </div>
          </div>
        </div>
      </SheetHeader>

      <div className="space-y-5 px-6 py-5">
        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading full venue details…
          </p>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Overview
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MiniStat label="Capacity" value={venue.capacity} />
            <MiniStat label="Bookings" value={venue.booking_count} />
            <MiniStat label="Pending" value={venue.pending_count} />
            <MiniStat label="Approved" value={venue.approved_count} />
          </div>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Venue details
          </h3>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <InfoField label="Name" value={venue.name} />
            <InfoField label="Capacity" value={venue.capacity} />
            <InfoField
              label="Max booking duration"
              value={formatDuration(venue.max_duration_mins)}
            />
            <InfoField
              label="Student bookable"
              value={venue.is_bookable_by_students ? 'Yes' : 'No'}
            />
            <InfoField label="Approver role" value={formatApprover(venue.approver_role)} />
            <InfoField label="Created" value={formatDateTime(venue.created_at)} />
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Amenities
          </h3>
          {amenities.length === 0 ? (
            <p className="rounded-lg border border-dashed border-sgvu-navy/15 px-3 py-3 text-sm text-muted-foreground">
              No amenities listed for this venue.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {amenities.map((item) => (
                <Badge key={item} variant="outline" className="rounded-lg px-2.5 py-1">
                  {item}
                </Badge>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">
            Recent bookings
          </h3>
          {(detail?.bookings ?? []).length === 0 ? (
            <p className="rounded-lg border border-dashed border-sgvu-navy/15 px-3 py-3 text-sm text-muted-foreground">
              No booking history for this venue yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {(detail?.bookings ?? []).map((booking) => (
                <li
                  key={String(booking.booking_id ?? `${booking.start_time}-${booking.student_name}`)}
                  className="rounded-lg border border-sgvu-navy/10 bg-white px-3 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-sgvu-navy">
                        {booking.student_name || booking.student_email || 'Student'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[
                          formatDateTime(booking.start_time),
                          booking.end_time
                            ? `to ${formatDateTime(booking.end_time)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </p>
                    </div>
                    {statusBadge(booking.status)}
                  </div>
                  {booking.purpose ? (
                    <p className="mt-2 text-sm text-sgvu-navy/90">{booking.purpose}</p>
                  ) : null}
                  {booking.approver_remarks ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Remarks: {booking.approver_remarks}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {mode === 'classrooms' ? (
          <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/80 px-3 py-3 text-sm text-muted-foreground">
            Room assignment for teaching continues through the{' '}
            <Link
              href={campusAdminRoutes.academicsTimetable}
              className="font-semibold text-sgvu-navy underline-offset-2 hover:underline"
            >
              Timetable
            </Link>{' '}
            module.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="rounded-xl border border-sgvu-navy/10 bg-slate-50/70 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-sgvu-navy">
        {value == null || Number.isNaN(Number(value))
          ? '—'
          : Number(value).toLocaleString('en-IN')}
      </p>
    </div>
  );
}

function InfoField({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">{display}</dd>
    </div>
  );
}
