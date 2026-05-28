'use client';

import { useState } from 'react';
import { QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/** Quick-action dialog mock — no page navigation required */
export function GatePassDialog() {
  const [approved, setApproved] = useState(false);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full justify-start gap-2 touch-target" size="lg">
          <QrCode className="h-5 w-5 text-sgvu-gold" />
          Request Gate Pass
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hostel Gate Pass</DialogTitle>
          <DialogDescription>Submit for warden approval. Show QR at security after approval.</DialogDescription>
        </DialogHeader>
        {!approved ? (
          <div className="space-y-4 py-2">
            <label className="space-y-2 block">
              <span className="text-sm font-medium">Exit date</span>
              <Input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </label>
            <label className="space-y-2 block">
              <span className="text-sm font-medium">Reason</span>
              <Input placeholder="e.g. Medical appointment" />
            </label>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="flex h-48 w-48 items-center justify-center rounded-2xl border-4 border-sgvu-gold bg-white">
              <QrCode className="h-32 w-32 text-sgvu-navy" />
            </div>
            <p className="text-center text-sm font-medium text-sgvu-navy">Scan at hostel gate · Valid today 4–8 PM</p>
            <p className="font-mono text-xs text-muted-foreground">SGVU-GP-8f3a2c91</p>
          </div>
        )}
        <DialogFooter>
          {!approved ? (
            <Button className="w-full" onClick={() => setApproved(true)}>
              Submit Request
            </Button>
          ) : (
            <Button variant="secondary" className="w-full" onClick={() => setApproved(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
