'use client';

import { useEffect, useState } from 'react';
import { Eye, MapPin, Calendar, AlertCircle } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';

type Duty = {
  assignment_id: string;
  exam_date: string;
  block_name: string | null;
  room: string;
  session_label: string | null;
  excuse_status: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  excuse_reason: string | null;
  exam_cell_comment: string | null;
};

export default function FacultyInvigilationPage() {
  const api = useAuthedApi();
  const [duties, setDuties] = useState<Duty[]>([]);
  const [requestingDuty, setRequestingDuty] = useState<Duty | null>(null);
  const [reason, setReason] = useState('');

  const loadDuties = () => {
    void api
      .get<Duty[]>('/api/academics/faculty/workspaces/invigilation')
      .then(setDuties)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to load invigilation duties');
        setDuties([]);
      });
  };

  useEffect(() => {
    loadDuties();
  }, [api]);

  async function submitExcuse() {
    if (!requestingDuty) return;
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }
    try {
      await api.post(`/api/academics/faculty/workspaces/invigilation/${requestingDuty.assignment_id}/excuse`, { reason });
      toast.success('Unavailability request submitted successfully');
      setRequestingDuty(null);
      setReason('');
      loadDuties();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit request');
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Read-only roster synced from Exam Cell — room, block, and session details."
        meta={<FacultyMetricChip label="Duties" value={duties.length} emphasis />}
      />

      {duties.length === 0 ? (
        <FacultyEmptyState description="No invigilation duties assigned yet." />
      ) : (
        <FacultyPanel title="Your invigilation roster" count={duties.length}>
          <div className="grid gap-3 sm:grid-cols-2">
            {duties.map((d) => (
              <div
                key={d.assignment_id}
                className="rounded-xl border border-border/60 bg-background p-4 shadow-sm transition-shadow hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                      <div>
                        <p className="font-semibold text-sgvu-navy">{d.session_label ?? 'Invigilation'}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(d.exam_date).toLocaleDateString('en-IN')}
                        </p>
                      </div>
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">Exam Cell</Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-sgvu-navy/60" />
                      Block {d.block_name ?? '—'} · Room {d.room}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t">
                  {d.excuse_status ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={d.excuse_status === 'APPROVED' ? 'default' : d.excuse_status === 'REJECTED' ? 'destructive' : 'secondary'}
                        >
                          {d.excuse_status === 'PENDING' ? 'Excuse Requested' : d.excuse_status === 'APPROVED' ? 'Excused' : 'Excuse Rejected'}
                        </Badge>
                      </div>
                      {d.excuse_status === 'REJECTED' && d.exam_cell_comment && (
                         <p className="text-xs text-red-600 bg-red-50 p-2 rounded flex items-start gap-1">
                           <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                           {d.exam_cell_comment}
                         </p>
                      )}
                    </div>
                  ) : (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full text-xs"
                      onClick={() => setRequestingDuty(d)}
                    >
                      Request Unavailability
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </FacultyPanel>
      )}

      <Dialog open={!!requestingDuty} onOpenChange={(open) => !open && setRequestingDuty(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Unavailability</DialogTitle>
            <DialogDescription>
              State the reason you are unable to attend the invigilation duty for {requestingDuty?.session_label} in Room {requestingDuty?.room}. This request will be reviewed by the Exam Cell.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason</label>
              <textarea 
                className="w-full rounded-md border p-3 text-sm min-h-[100px]"
                placeholder="E.g., Medical emergency, clash with another scheduled academic activity..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestingDuty(null)}>Cancel</Button>
            <Button onClick={() => void submitExcuse()} disabled={!reason.trim()}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
