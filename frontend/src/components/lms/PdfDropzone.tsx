'use client';

import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxMb?: number;
  label?: string;
};

export function PdfDropzone({ onFile, disabled, maxMb = 5, label }: Props) {
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const pick = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      if (!file.name.toLowerCase().endsWith('.pdf')) return;
      if (file.size > maxMb * 1024 * 1024) return;
      setFileName(file.name);
      onFile(file);
    },
    [disabled, maxMb, onFile],
  );

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        drag ? 'border-sgvu-navy bg-sgvu-navy/5' : 'border-muted-foreground/30',
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
      <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">{label ?? 'Drag & drop your PDF here'}</p>
      <p className="mt-1 text-xs text-muted-foreground">PDF only · Max {maxMb}MB</p>
      <label className="mt-3 inline-block cursor-pointer text-sm font-medium text-sgvu-navy underline">
        Browse files
        <input
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          disabled={disabled}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      {fileName && <p className="mt-2 text-xs text-emerald-700">Selected: {fileName}</p>}
    </div>
  );
}
