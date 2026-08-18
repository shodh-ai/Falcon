'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { REG_BRAND_BTN, REG_OUTLINE_BTN } from '@/components/admin/registrar-desk/RegistrarDeskChrome';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';
import type { HodCandidate } from './department-types';

export function AssignHodDialog({
  open,
  onOpenChange,
  deptId,
  deptName,
  currentHodId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deptId: number;
  deptName: string;
  currentHodId?: string | null;
  onSaved: () => void;
}) {
  const api = useAuthedApi();
  const [saving, setSaving] = useState(false);
  const [hodUserId, setHodUserId] = useState('');
  const [candidates, setCandidates] = useState<HodCandidate[]>([]);

  useEffect(() => {
    if (!open) return;
    setHodUserId(currentHodId ?? '');
    void api
      .get<HodCandidate[]>('/api/admin-control/hod/candidates')
      .then((rows) => setCandidates(Array.isArray(rows) ? rows : []))
      .catch(() => setCandidates([]));
  }, [api, currentHodId, open]);

  async function save() {
    setSaving(true);
    try {
      if (!hodUserId) {
        await api.post(`/api/admin-control/hod/${deptId}/remove`);
        toast.success('HOD assignment removed.');
      } else {
        await api.post('/api/admin-control/hod/assign', {
          dept_id: deptId,
          hod_user_id: hodUserId,
        });
        toast.success('HOD assigned.');
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update HOD assignment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign HOD</DialogTitle>
          <DialogDescription>
            Choose an existing faculty, HOD, or dean record for {deptName}. A new user is not created.
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1.5 text-sm">
          <span className="font-semibold text-sgvu-navy">Head of Department</span>
          <Select
            value={hodUserId}
            onChange={(e) => setHodUserId(e.target.value)}
            className="h-11 rounded-xl border-sgvu-navy/15"
          >
            <option value="">No HOD assigned</option>
            {candidates.map((person) => (
              <option key={person.user_id} value={person.user_id}>
                {person.name}
                {person.role_name ? ` · ${person.role_name}` : ''}
              </option>
            ))}
          </Select>
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" className={cn(REG_OUTLINE_BTN, 'h-10')} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className={cn(REG_BRAND_BTN, 'h-10')} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save assignment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
