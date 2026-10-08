'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  onConfirm: () => void;
  busy?: boolean;
  courseLabel?: string;
};

export function PublishConfirmDialog({
  open,
  onOpenChange,
  confirmText,
  onConfirmTextChange,
  onConfirm,
  busy,
  courseLabel,
}: Props) {
  const canConfirm = confirmText.trim().toUpperCase() === 'PUBLISH';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-700">Push to Student Portals</DialogTitle>
          <DialogDescription>
            This will publish {courseLabel ?? 'results'} to every student portal and send notifications.
            This action cannot be undone without reopening the session.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">
            Type <strong className="text-red-700">PUBLISH</strong> to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => onConfirmTextChange(e.target.value)}
            placeholder="Type PUBLISH"
            className="border-red-200 focus-visible:ring-red-400"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canConfirm || busy}
            onClick={onConfirm}
          >
            Push to Student Portals
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
