'use client';

import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notifications/falcon-toast';
import { ASSIGNMENT_FILE_ACCEPT, assignmentFileError } from '@/lib/faculty/assignment-files';

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

export function AssignmentFileDropzone({ onFile, disabled }: Props) {
  const [drag, setDrag] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const pick = useCallback((file: File | undefined) => {
    if (!file || disabled) return;
    const error = assignmentFileError(file);
    if (error) {
      toast.error(error);
      return;
    }
    setFileName(file.name);
    onFile(file);
  }, [disabled, onFile]);

  return (
    <div
      className={cn(
        'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        drag ? 'border-sgvu-navy bg-sgvu-navy/5' : 'border-muted-foreground/30',
        disabled && 'pointer-events-none opacity-50',
      )}
      onDragOver={(event) => { event.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDrag(false);
        pick(event.dataTransfer.files[0]);
      }}
    >
      <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium">Drag and drop your assignment file here</p>
      <p className="mt-1 text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel, PNG, JPEG, TXT · Max 10MB</p>
      <label className="mt-3 inline-block cursor-pointer text-sm font-medium text-sgvu-navy underline">
        Browse files
        <input type="file" accept={ASSIGNMENT_FILE_ACCEPT} className="hidden" disabled={disabled}
          onChange={(event) => pick(event.target.files?.[0])} />
      </label>
      {fileName && <p className="mt-2 text-xs text-emerald-700">Selected: {fileName}</p>}
    </div>
  );
}
