'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodDataTable, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';

type Row = {
  proxy_id: string;
  date_of_proxy: string;
  course_code: string;
  course_name: string;
  absent_faculty_name: string;
  proxy_faculty_name: string;
  start_time: string;
  end_time: string;
};

type Faculty = { user_id: string; name: string; email: string };
type Lecture = { timetable_id: string; course_code: string; course_name: string;
  lecture_date: string; start_time: string; end_time: string };
type MoveGroup = {
  change_group_id: string; move_type: string; reason: string; legs: number;
  requested_by_user_id: string;
  sessions: Array<{ course_code: string; source_date: string; target_date: string;
    target_start_time: string; target_end_time: string; target_room: string | null }>;
};

export default function HodProxyApprovalsPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [faculty, setFaculty] = useState<Faculty[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [sourceFacultyId, setSourceFacultyId] = useState('');
  const [coverDate, setCoverDate] = useState('');
  const [timetableId, setTimetableId] = useState('');
  const [substituteId, setSubstituteId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [moves, setMoves] = useState<MoveGroup[]>([]);

  useEffect(() => {
    void api
      .get<Row[]>('/api/academics/hod/approvals/proxy-requests')
      .then(setRows)
      .catch(() => toast.error('Failed to load proxy approvals'))
      .finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    void api.get<Faculty[]>('/api/academics/hod/proxy/faculty')
      .then((data) => setFaculty(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Could not load department faculty'));
  }, [api]);

  useEffect(() => {
    void api.get<MoveGroup[]>('/api/academics/session-changes/hod/pending')
      .then((data) => setMoves(Array.isArray(data) ? data : []))
      .catch(() => toast.error('Could not load pending class changes'));
  }, [api]);

  async function decideMove(groupId: string, action: 'APPROVE' | 'REJECT') {
    try {
      await api.patch(`/api/academics/session-changes/hod/${groupId}`, { action });
      toast.success(action === 'APPROVE' ? 'Class change approved and published to calendars' : 'Class change rejected');
      setMoves(await api.get<MoveGroup[]>('/api/academics/session-changes/hod/pending'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not decide class change');
    }
  }

  useEffect(() => {
    if (!sourceFacultyId || !coverDate) return;
    let cancelled = false;
    void api.get<Lecture[]>(`/api/academics/hod/proxy/lectures?faculty_id=${encodeURIComponent(sourceFacultyId)}&start_date=${coverDate}&end_date=${coverDate}`)
      .then((data) => { if (!cancelled) setLectures(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setLectures([]); });
    return () => { cancelled = true; };
  }, [api, sourceFacultyId, coverDate]);

  async function propose() {
    if (!sourceFacultyId || !coverDate || !timetableId || !substituteId || !reason.trim()) {
      toast.error('Choose the faculty, date, class, substitute and reason');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/academics/hod/proxy-requests', {
        absent_faculty_id: sourceFacultyId,
        timetable_id: timetableId,
        proxy_faculty_id: substituteId,
        date_of_proxy: coverDate,
        reason: reason.trim(),
      });
      toast.success('Offer sent to substitute faculty. HOD approval follows acceptance.');
      setTimetableId(''); setSubstituteId(''); setReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not propose substitute');
    } finally { setSubmitting(false); }
  }

  async function act(proxyId: string, action: 'APPROVE' | 'REJECT') {
    try {
      await api.patch(`/api/academics/hod/approvals/proxy-requests/${proxyId}`, { action });
      toast.success(action === 'APPROVE' ? 'Proxy approved — alternate faculty can mark attendance' : 'Rejected');
      setRows(await api.get('/api/academics/hod/approvals/proxy-requests'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Proxy / Alternate Teaching"
        description="When faculty apply leave, they nominate a proxy to cover classes. You approve before the substitute can mark attendance."
      />
      <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-sm text-slate-700 space-y-2">
        <p className="font-semibold text-sgvu-navy">Approval pipeline</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>Faculty or HOD proposes a colleague for one dated class slot.</li>
          <li>The colleague accepts, then the request appears here for HOD approval.</li>
          <li>Approval checks timetable clashes again before assigning cover.</li>
          <li>Only that approved substitute can mark the covered class attendance.</li>
        </ol>
      </div>
      <div className="mb-5 grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2">
        <p className="sm:col-span-2 font-semibold text-sgvu-navy">Arrange a substitute</p>
        <Select aria-label="Original faculty" value={sourceFacultyId} onChange={(event) => {
          setSourceFacultyId(event.target.value); setTimetableId(''); setLectures([]);
        }}>
          <option value="">Select original faculty</option>
          {faculty.map((person) => <option key={person.user_id} value={person.user_id}>{person.name} ({person.email})</option>)}
        </Select>
        <Input aria-label="Class date" type="date" value={coverDate} onChange={(event) => {
          setCoverDate(event.target.value); setTimetableId(''); setLectures([]);
        }} />
        <Select aria-label="Class slot" value={timetableId} onChange={(event) => setTimetableId(event.target.value)}>
          <option value="">Select scheduled class</option>
          {lectures.map((lecture) => <option key={`${lecture.timetable_id}-${lecture.lecture_date}`} value={lecture.timetable_id}>
            {lecture.course_code} · {String(lecture.start_time).slice(0, 5)}–{String(lecture.end_time).slice(0, 5)}
          </option>)}
        </Select>
        <Select aria-label="Substitute faculty" value={substituteId} onChange={(event) => setSubstituteId(event.target.value)}>
          <option value="">Select substitute faculty</option>
          {faculty.filter((person) => person.user_id !== sourceFacultyId).map((person) => <option key={person.user_id} value={person.user_id}>{person.name}</option>)}
        </Select>
        <Input aria-label="Reason" placeholder="Reason for substitution" value={reason} onChange={(event) => setReason(event.target.value)} />
        <Button disabled={submitting} onClick={() => void propose()}>Send substitute offer</Button>
      </div>
      <HodDataTable
        loading={loading}
        rows={rows}
        rowKey={(r) => r.proxy_id}
        empty="No pending proxy requests."
        columns={[
          { key: 'course', label: 'Course', render: (r) => `${r.course_code} — ${r.course_name}` },
          { key: 'date', label: 'Date', render: (r) => r.date_of_proxy },
          { key: 'absent', label: 'Absent faculty', render: (r) => r.absent_faculty_name },
          { key: 'proxy', label: 'Proxy faculty', render: (r) => r.proxy_faculty_name },
          {
            key: 'actions',
            label: '',
            render: (r) => (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void act(r.proxy_id, 'APPROVE')}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => void act(r.proxy_id, 'REJECT')}>Reject</Button>
              </div>
            ),
          },
        ]}
      />
      <section className="mt-6 space-y-3 rounded-xl border bg-white p-4" aria-label="Date-specific class changes">
        <div>
          <h2 className="font-semibold text-sgvu-navy">Reschedules, swaps and reshuffles</h2>
          <p className="text-sm text-muted-foreground">Each group is decided together. Approval checks faculty, room and student availability and recorded attendance. The proposer cannot approve their own request.</p>
        </div>
        {moves.length === 0 ? <p className="text-sm text-muted-foreground">No class changes awaiting approval.</p> : moves.map((move) => <div key={move.change_group_id} className="rounded-lg border p-3 space-y-2 text-sm">
          <p className="font-semibold">{move.move_type} · {move.legs} {move.legs === 1 ? 'class' : 'classes'}</p>
          <p>{move.reason}</p>
          {move.sessions.map((session, index) => <p key={index} className="text-muted-foreground">
            {session.course_code}: {String(session.source_date).slice(0, 10)} → {String(session.target_date).slice(0, 10)} {String(session.target_start_time).slice(0, 5)}–{String(session.target_end_time).slice(0, 5)} · {session.target_room || 'Room TBA'}
          </p>)}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void decideMove(move.change_group_id, 'APPROVE')}>Approve all</Button>
            <Button size="sm" variant="outline" onClick={() => void decideMove(move.change_group_id, 'REJECT')}>Reject all</Button>
          </div>
        </div>)}
      </section>
    </HodPageFrame>
  );
}
