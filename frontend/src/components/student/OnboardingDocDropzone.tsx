'use client';

import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxMb?: number;
  label?: string;
  accept?: string;
  hint?: string;
  fileName?: string | null;
};

export function OnboardingDocDropzone({
  onFile,
  disabled,
  maxMb = 5,
  label,
  accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  hint = 'PDF or image · Max 5MB',
  fileName,
}: Props) {
  const [drag, setDrag] = useState(false);
  const [localName, setLocalName] = useState<string | null>(null);

  const pick = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      const lower = file.name.toLowerCase();
      const ok =
        lower.endsWith('.pdf') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png');
      if (!ok) return;
      if (file.size > maxMb * 1024 * 1024) return;
      setLocalName(file.name);
      onFile(file);
    },
    [disabled, maxMb, onFile],
  );

  const displayName = fileName ?? localName;

  return (
    <div
      className={cn(
        'rounded-xl border-2 border-dashed p-4 text-center transition-colors',
        drag ? 'border-sgvu-navy bg-sgvu-navy/5' : 'border-muted-foreground/30 bg-background',
        disabled && 'pointer-events-none opacity-50',
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files[0]);
      }}
    >
      <Upload className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
      <p className="text-sm font-medium">{label ?? 'Upload document'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <label className="mt-2 inline-block cursor-pointer text-xs font-medium text-sgvu-navy underline">
        Browse files
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      {displayName && <p className="mt-2 text-xs text-emerald-700">Selected: {displayName}</p>}
    </div>
  );
}
