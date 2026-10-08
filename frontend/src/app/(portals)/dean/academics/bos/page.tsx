'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function BosCurriculumPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<any[]>([]);
  const [title, setTitle] = useState('Deep-Tech Elective: Quantum Sensing');

  const reload = () =>
    api.get<any[]>('/api/uos/sis/curriculum').then(setRows).catch(() => setRows([]));

  useEffect(() => {
    void reload();
  }, [api]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Curriculum / BoS DOFA</h1>
      <p className="text-sm text-muted-foreground">
        Syllabus proposal → Board of Studies countersignatures (≥2) → Dean finalize.
      </p>
      <div className="flex gap-2 max-w-xl">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button
          onClick={() =>
            api
              .post('/api/uos/sis/curriculum', {
                title,
                syllabus_pdf_path: '/uploads/syllabus-draft.pdf',
                course_code: 'DT501',
                effective_term: '2026-ODD',
              })
              .then(() => {
                toast.success('Pending BoS');
                return reload();
              })
              .catch((e) => toast.error(String(e?.message ?? e)))
          }
        >
          Propose
        </Button>
      </div>
      {rows.map((r) => (
        <div key={r.proposal_id} className="flex flex-wrap gap-2 border-b py-2 text-sm items-center">
          <span>
            {r.title} · {r.status} · sigs=
            {Array.isArray(r.bos_signatures) ? r.bos_signatures.length : 0}
          </span>
          {r.status === 'PENDING_BOS' && (
            <Button
              size="sm"
              onClick={() =>
                api
                  .post(`/api/uos/sis/curriculum/${r.proposal_id}/bos-sign`)
                  .then(() => reload())
                  .catch((e) => toast.error(String(e?.message ?? e)))
              }
            >
              BoS sign
            </Button>
          )}
          {r.status === 'PENDING_DEAN' && (
            <Button
              size="sm"
              onClick={() =>
                api
                  .post(`/api/uos/sis/curriculum/${r.proposal_id}/finalize`)
                  .then(() => reload())
                  .catch((e) => toast.error(String(e?.message ?? e)))
              }
            >
              Dean finalize
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
