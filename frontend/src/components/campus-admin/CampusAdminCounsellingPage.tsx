'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Search } from 'lucide-react';
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
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

type SeatRow = {
  seat_id: string;
  program_code: string;
  program_name: string;
  total_seats: number;
  filled_seats: number;
  remaining_seats: number;
  academic_year?: string | null;
  school_name?: string | null;
  updated_at?: string | null;
};

type MeritRow = {
  rank_id: string;
  applicant_name: string;
  entrance_score: number | string;
  category: string;
  merit_rank: number;
  counseling_date?: string | null;
  program_preference?: string | null;
  academic_year?: string | null;
  status?: string | null;
};

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

export function CampusAdminCounsellingPage() {
  const api = useAuthedApi();
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [merit, setMerit] = useState<MeritRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [availability, setAvailability] = useState('');
  const [school, setSchool] = useState('');
  const [meritQ, setMeritQ] = useState('');
  const [allotting, setAllotting] = useState<string | null>(null);
  const [selectedSeat, setSelectedSeat] = useState<SeatRow | null>(null);
  const [selectedMerit, setSelectedMerit] = useState<MeritRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [seatRows, meritRows] = await Promise.all([
        api.get<SeatRow[]>('/api/admissions-crm/counseling/seats'),
        api.get<MeritRow[]>('/api/admissions-crm/counseling/merit-list').catch(() => []),
      ]);
      setSeats(Array.isArray(seatRows) ? seatRows : []);
      setMerit(Array.isArray(meritRows) ? meritRows : []);
    } catch (err) {
      setSeats([]);
      setMerit([]);
      setError(parseApiError(err) || 'Unable to load counselling data.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const schools = useMemo(
    () => [...new Set(seats.map((row) => row.school_name).filter((value): value is string => Boolean(value)))].sort(),
    [seats],
  );

  const filteredSeats = useMemo(() => {
    const term = q.trim().toLowerCase();
    return seats.filter((row) => {
      if (term && !`${row.program_name} ${row.program_code} ${row.school_name ?? ''}`.toLowerCase().includes(term)) {
        return false;
      }
      if (school && row.school_name !== school) return false;
      const remaining = Number(row.remaining_seats ?? 0);
      if (availability === 'open' && remaining <= 0) return false;
      if (availability === 'full' && remaining > 0) return false;
      return true;
    });
  }, [availability, q, school, seats]);

  const filteredMerit = useMemo(() => {
    const term = meritQ.trim().toLowerCase();
    if (!term) return merit;
    return merit.filter((row) =>
      `${row.applicant_name} ${row.program_preference ?? ''} ${row.category}`.toLowerCase().includes(term),
    );
  }, [merit, meritQ]);

  const totals = useMemo(() => {
    const total = seats.reduce((sum, row) => sum + Number(row.total_seats ?? 0), 0);
    const filled = seats.reduce((sum, row) => sum + Number(row.filled_seats ?? 0), 0);
    return {
      programs: seats.length,
      total,
      filled,
      remaining: Math.max(0, total - filled),
    };
  }, [seats]);

  const recordBooking = async (row: SeatRow) => {
    if (Number(row.remaining_seats) <= 0) return;
    setAllotting(row.program_code);
    try {
      const updated = await api.post<SeatRow | null>(
        `/api/admissions-crm/counseling/seats/${encodeURIComponent(row.program_code)}/allot`,
        {},
      );
      if (!updated) {
        toast.error('No seats remaining');
      } else {
        toast.success('Booking recorded');
      }
      await load();
    } catch (err) {
      toast.error(parseApiError(err) || 'No seats remaining');
    } finally {
      setAllotting(null);
    }
  };

  return (
    <div className="space-y-5 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-sgvu-navy">Counselling</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live seat matrix for programs on your assigned campus.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CountCard label="Programs" value={loading ? '—' : totals.programs} />
        <CountCard label="Total seats" value={loading ? '—' : totals.total} />
        <CountCard label="Filled" value={loading ? '—' : totals.filled} />
        <CountCard label="Remaining" value={loading ? '—' : totals.remaining} />
      </div>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div>
            <h2 className="text-base font-semibold text-sgvu-navy">Seat matrix</h2>
            <p className="text-sm text-muted-foreground">Filled counts update when a booking is recorded.</p>
          </div>
          {error ? (
            <div className="py-8 text-center">
              <p className="text-sm text-destructive">{error}</p>
              <Button className="mt-3 h-9" variant="outline" onClick={() => void load()}>
                Retry
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search by program or code..."
                    className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
                  />
                </div>
                {schools.length > 0 ? (
                  <Select
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-56"
                  >
                    <option value="">All schools</option>
                    {schools.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </Select>
                ) : null}
                <Select
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                  className="h-10 w-full rounded-xl border-sgvu-navy/15 lg:w-40"
                >
                  <option value="">All seats</option>
                  <option value="open">Open</option>
                  <option value="full">Full</option>
                </Select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="p-3 font-medium">Program</th>
                      <th className="p-3 font-medium">School</th>
                      <th className="p-3 font-medium">Filled</th>
                      <th className="p-3 font-medium">Remaining</th>
                      <th className="p-3 font-medium">Status</th>
                      <th className="p-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading…
                          </span>
                        </td>
                      </tr>
                    ) : filteredSeats.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No seat matrix rows for programs on this campus.
                        </td>
                      </tr>
                    ) : (
                      filteredSeats.map((row) => {
                        const remaining = Number(row.remaining_seats ?? 0);
                        return (
                          <tr key={row.seat_id} className="border-b last:border-0 hover:bg-muted/40">
                            <td className="p-3">
                              <p className="font-semibold text-sgvu-navy">{row.program_name}</p>
                              <p className="text-xs text-muted-foreground">{row.program_code}</p>
                            </td>
                            <td className="p-3">{row.school_name || '—'}</td>
                            <td className="p-3">
                              {Number(row.filled_seats ?? 0)} / {Number(row.total_seats ?? 0)}
                            </td>
                            <td className="p-3">{remaining}</td>
                            <td className="p-3">
                              <Badge variant={remaining > 0 ? 'success' : 'secondary'}>
                                {remaining > 0 ? 'Open' : 'Full'}
                              </Badge>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-3">
                                <button
                                  type="button"
                                  className="text-sm font-semibold text-sgvu-navy hover:underline"
                                  onClick={() => setSelectedSeat(row)}
                                >
                                  View
                                </button>
                                <button
                                  type="button"
                                  className="text-sm font-semibold text-sgvu-navy hover:underline disabled:text-muted-foreground"
                                  disabled={remaining <= 0 || allotting === row.program_code}
                                  onClick={() => void recordBooking(row)}
                                >
                                  {allotting === row.program_code ? 'Recording…' : 'Record booking'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-4 md:p-5">
          <div>
            <h2 className="text-base font-semibold text-sgvu-navy">Merit list</h2>
            <p className="text-sm text-muted-foreground">Ranked applicants whose program sits on this campus.</p>
          </div>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={meritQ}
              onChange={(e) => setMeritQ(e.target.value)}
              placeholder="Search applicants..."
              className="h-10 rounded-xl border-sgvu-navy/15 pl-9"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="p-3 font-medium">Rank</th>
                  <th className="p-3 font-medium">Applicant</th>
                  <th className="p-3 font-medium">Score</th>
                  <th className="p-3 font-medium">Category</th>
                  <th className="p-3 font-medium">Program</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Loading…
                    </td>
                  </tr>
                ) : filteredMerit.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No merit ranks for this campus yet.
                    </td>
                  </tr>
                ) : (
                  filteredMerit.map((row) => (
                    <tr key={row.rank_id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="p-3 font-semibold text-sgvu-navy">{row.merit_rank}</td>
                      <td className="p-3">{row.applicant_name}</td>
                      <td className="p-3">{row.entrance_score}</td>
                      <td className="p-3">{row.category}</td>
                      <td className="p-3">{row.program_preference || '—'}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{(row.status || 'PENDING').replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          className="text-sm font-semibold text-sgvu-navy hover:underline"
                          onClick={() => setSelectedMerit(row)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={Boolean(selectedSeat)} onOpenChange={(open) => !open && setSelectedSeat(null)}>
        <SheetContent side="right" className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy">
          {selectedSeat ? (
            <div className="px-6 pb-6 pt-6 pr-14">
              <SheetHeader className="text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Seat matrix</p>
                <SheetTitle className="mt-1 text-xl font-bold text-sgvu-navy">{selectedSeat.program_name}</SheetTitle>
                <SheetDescription>{selectedSeat.program_code}</SheetDescription>
              </SheetHeader>
              <div className="mt-5 space-y-5">
                <Section title="Program">
                  <Field label="Program" value={selectedSeat.program_name} />
                  <Field label="Code" value={selectedSeat.program_code} />
                  <Field label="School" value={selectedSeat.school_name} />
                  <Field label="Academic year" value={selectedSeat.academic_year} />
                </Section>
                <Section title="Seats">
                  <Field label="Total" value={selectedSeat.total_seats} />
                  <Field label="Filled" value={selectedSeat.filled_seats} />
                  <Field label="Remaining" value={selectedSeat.remaining_seats} />
                  <Field label="Status" value={Number(selectedSeat.remaining_seats) > 0 ? 'Open' : 'Full'} />
                </Section>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(selectedMerit)} onOpenChange={(open) => !open && setSelectedMerit(null)}>
        <SheetContent side="right" className="w-[min(100vw,40rem)] overflow-y-auto bg-white p-0 text-sgvu-navy">
          {selectedMerit ? (
            <div className="px-6 pb-6 pt-6 pr-14">
              <SheetHeader className="text-left">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Merit rank</p>
                <SheetTitle className="mt-1 text-xl font-bold text-sgvu-navy">{selectedMerit.applicant_name}</SheetTitle>
                <SheetDescription>Rank {selectedMerit.merit_rank}</SheetDescription>
              </SheetHeader>
              <div className="mt-5">
                <Section title="Applicant">
                  <Field label="Name" value={selectedMerit.applicant_name} />
                  <Field label="Rank" value={selectedMerit.merit_rank} />
                  <Field label="Score" value={selectedMerit.entrance_score} />
                  <Field label="Category" value={selectedMerit.category} />
                  <Field label="Program" value={selectedMerit.program_preference} />
                  <Field label="Status" value={selectedMerit.status} />
                  <Field label="Counselling date" value={formatDate(selectedMerit.counseling_date)} />
                  <Field label="Academic year" value={selectedMerit.academic_year} />
                </Section>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function CountCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-sgvu-navy/10 bg-white shadow-sm">
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-sgvu-navy">{value}</p>
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sgvu-gold">{title}</h3>
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  const display = value == null || value === '' ? '—' : String(value);
  return (
    <div className="rounded-lg border border-sgvu-navy/10 bg-slate-50/70 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all text-sm font-medium text-sgvu-navy">{display}</dd>
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
