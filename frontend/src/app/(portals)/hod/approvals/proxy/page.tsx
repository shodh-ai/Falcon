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
    setTimetableId('');
    if (!sourceFacultyId || !coverDate) { setLectures([]); return; }
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
        <Select aria-label="Original faculty" value={sourceFacultyId} onChange={(event) => setSourceFacultyId(event.target.value)}>
          <option value="">Select original faculty</option>
          {faculty.map((person) => <option key={person.user_id} value={person.user_id}>{person.name} ({person.email})</option>)}
        </Select>
        <Input aria-label="Class date" type="date" value={coverDate} onChange={(event) => setCoverDate(event.target.value)} />
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
    </HodPageFrame>
  );
}
