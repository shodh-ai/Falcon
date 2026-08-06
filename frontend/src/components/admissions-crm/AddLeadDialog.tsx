'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

export type AddLeadFormValues = {
  full_name: string;
  email: string;
  phone: string;
  program: string;
  city: string;
};

const EMPTY: AddLeadFormValues = {
  full_name: '',
  email: '',
  phone: '',
  program: '',
  city: '',
};

export function AddLeadDialog({
  open,
  onOpenChange,
  submitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  onSubmit: (values: AddLeadFormValues) => Promise<void> | void;
}) {
  const [form, setForm] = useState<AddLeadFormValues>(EMPTY);

  function update<K extends keyof AddLeadFormValues>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    await onSubmit(form);
    setForm(EMPTY);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setForm(EMPTY);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sgvu-navy">Add lead</DialogTitle>
          <DialogDescription>
            Capture candidate contact details for the admissions pipeline.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">Full name *</span>
            <Input
              value={form.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              placeholder="Dr. Ankit Sharma"
              className="h-10"
              autoFocus
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Email</span>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="candidate@email.com"
              className="h-10"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Phone</span>
            <Input
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
              placeholder="+91 …"
              className="h-10"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Program</span>
            <Input
              value={form.program}
              onChange={(e) => update('program', e.target.value)}
              placeholder="B.Tech CSE"
              className="h-10"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">City</span>
            <Input
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
              placeholder="Jaipur"
              className="h-10"
            />
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(BRAND_BTN)}
            disabled={submitting || !form.full_name.trim()}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Creating…' : 'Create lead'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
