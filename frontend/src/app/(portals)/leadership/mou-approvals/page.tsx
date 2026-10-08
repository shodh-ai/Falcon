'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function MouLegalPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<any[]>([]);
  const [evidence, setEvidence] = useState<any[]>([]);
  const [title, setTitle] = useState('MOU with CEERI Pilani');

  const reload = () =>
    Promise.all([
      api.get<any[]>('/api/uos/legal/mous'),
      api.get<any[]>('/api/uos/accreditation/evidence').catch(() => []),
    ]).then(([m, e]) => {
      setRows(m);
      setEvidence(e);
    });

  useEffect(() => {
    void reload().catch(() => setRows([]));
  }, [api]);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Legal MOU DOFA</h1>
      <p className="text-sm text-muted-foreground">
        Legal Officer → Dean → VC/President auto-sign. Evidence feeds NAAC/IQAC inbox.
      </p>
      <div className="flex gap-2 max-w-xl">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button
          onClick={() =>
            api
              .post('/api/uos/legal/mous', {
                title,
                counterparty: 'CEERI Pilani',
                pdf_path: '/uploads/mou-draft.pdf',
              })
              .then(() => {
                toast.success('Submitted to Legal');
                return reload();
              })
              .catch((e) => toast.error(String(e?.message ?? e)))
          }
        >
          Submit MOU
        </Button>
      </div>
      {rows.map((r) => (
        <div key={r.mou_approval_id} className="flex gap-2 border-b py-2 text-sm items-center">
          <span>
            {r.title} · {r.status}
          </span>
          <Button
            size="sm"
            onClick={() =>
              api
                .post(`/api/uos/legal/mous/${r.mou_approval_id}/advance`)
                .then(() => reload())
                .catch((e) => toast.error(String(e?.message ?? e)))
            }
          >
            Advance
          </Button>
        </div>
      ))}
      <section>
        <h2 className="font-semibold">Accreditation evidence feed</h2>
        <ul className="text-sm list-disc pl-5">
          {evidence.slice(0, 20).map((e) => (
            <li key={e.event_id}>
              [{e.source_system}] {e.title}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
