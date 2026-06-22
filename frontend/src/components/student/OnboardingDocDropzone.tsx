'use client';

import { useCallback, useState } from 'react';
import { FileText, ImageIcon, Upload, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxMb?: number;
  label?: string;
  accept?: string;
  hint?: string;
  fileName?: string | null;
  compact?: boolean;
};

export function OnboardingDocDropzone({
  onFile,
  disabled,
  maxMb = 5,
  label,
  accept = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png',
  hint = 'PDF or image · Max 5MB',
  fileName,
  compact = true,
}: Props) {
  const [drag, setDrag] = useState(false);
  const [localName, setLocalName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback(
    (file: File | undefined) => {
      if (!file || disabled) return;
      setError(null);
      const lower = file.name.toLowerCase();
      const ok =
        lower.endsWith('.pdf') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.png');
      if (!ok) {
        setError('Use PDF, JPG, or PNG');
        return;
      }
      if (file.size > maxMb * 1024 * 1024) {
        setError(`Max ${maxMb}MB`);
        return;
      }
      setLocalName(file.name);
      onFile(file);
    },
    [disabled, maxMb, onFile],
  );

  const displayName = fileName ?? localName;
  const uploaded = Boolean(displayName);
  const isPhoto = label?.toLowerCase().includes('photo');
  const DocIcon = isPhoto ? ImageIcon : FileText;

  if (compact) {
    return (
      <div
        className={cn(
          'group relative flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all',
          uploaded
            ? 'border-emerald-300/70 bg-emerald-50/50'
            : 'border-border/70 bg-white hover:border-sgvu-navy/25 hover:shadow-sm',
          drag && !uploaded && 'border-sgvu-navy bg-sgvu-navy/[0.03]',
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
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            uploaded ? 'bg-emerald-100 text-emerald-700' : 'bg-sgvu-surface text-sgvu-navy',
          )}
        >
          {uploaded ? <CheckCircle2 className="h-5 w-5" /> : <DocIcon className="h-5 w-5" />}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{label ?? 'Document'}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {uploaded ? displayName : hint}
          </p>
          {error ? <p className="mt-0.5 text-[11px] text-red-600">{error}</p> : null}
        </div>

        <label
          className={cn(
            'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition',
            uploaded
              ? 'bg-white text-sgvu-navy ring-1 ring-border hover:bg-sgvu-surface'
              : 'bg-sgvu-navy text-white hover:bg-sgvu-navy/90',
          )}
        >
          {uploaded ? 'Replace' : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </>
          )}
          <input
            type="file"
            accept={accept}
            className="hidden"
            disabled={disabled}
            onChange={(e) => pick(e.target.files?.[0])}
          />
        </label>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border-2 border-dashed p-5 text-center transition-colors',
        uploaded && 'border-emerald-400/60 bg-emerald-50/40',
        drag && !uploaded && 'border-sgvu-navy bg-sgvu-navy/5',
        !drag && !uploaded && 'border-muted-foreground/25 bg-background',
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
      {uploaded ? (
        <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
      ) : (
        <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      )}
      <p className="text-sm font-medium">{label ?? 'Upload document'}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <label className="mt-3 inline-flex cursor-pointer rounded-lg bg-sgvu-navy px-4 py-2 text-xs font-semibold text-white hover:bg-sgvu-navy/90">
        {uploaded ? 'Replace file' : 'Browse files'}
        <input
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(e) => pick(e.target.files?.[0])}
        />
      </label>
      {displayName ? <p className="mt-2 text-xs font-medium text-emerald-700">{displayName}</p> : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
