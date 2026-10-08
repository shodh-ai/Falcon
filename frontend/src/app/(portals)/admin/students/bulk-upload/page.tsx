'use client';

import { useCallback, useState } from 'react';
import { Upload } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/lib/api/client';
import { getSubdomainFromClient } from '@/lib/tenant';
import { cn } from '@/lib/utils';

const BRAND_BTN =
  'border border-[#0B2447] bg-[#0B2447] text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

export default function AdminStudentBulkUploadPage() {
  const { token } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [lastResult, setLastResult] = useState<{ created: number } | null>(null);

  async function downloadTemplate() {
    if (!token) return;
    const res = await fetch(`${API_URL}/admissions/students/bulk-upload/template`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-tenant-subdomain': getSubdomainFromClient(),
      },
    });
    if (!res.ok) {
      toast.error('Failed to download template');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-bulk-upload-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }

  const uploadFile = useCallback(
    async (file: File) => {
      if (!token) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API_URL}/admissions/students/bulk-upload`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'x-tenant-subdomain': getSubdomainFromClient(),
          },
          body: formData,
        });
        const text = await res.text();
        if (!res.ok) {
          let msg = text;
          try {
            const parsed = JSON.parse(text) as {
              message?: string | { line?: number; message?: string };
            };
            if (typeof parsed.message === 'object' && parsed.message?.line) {
              msg = `Row ${parsed.message.line}: ${parsed.message.message}`;
            } else if (typeof parsed.message === 'string') {
              msg = parsed.message;
            }
          } catch {
            /* keep raw */
          }
          throw new Error(msg);
        }
        const data = JSON.parse(text) as { created: number };
        setLastResult(data);
        toast.success(`Created ${data.created} student accounts`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [token],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="p-5 md:p-6">
          <h1 className="text-2xl font-semibold text-sgvu-navy">Student Excel Upload</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bulk ingest students at the start of the year. Each row creates a student account,
            assigns the Student role, generates a PRN, and sends welcome credentials by email.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Template & upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Columns: Name, Email, Phone, Father Name, Batch. Configure an enrollment/PRN rule in
            Super Admin settings before uploading.
          </p>
          <Button
            type="button"
            className={cn('h-10', BRAND_BTN)}
            onClick={() => void downloadTemplate()}
          >
            Download template
          </Button>

          <div
            className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-sgvu-navy bg-muted/50' : 'border-border'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void uploadFile(file);
            }}
          >
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Drop Excel or CSV file here</p>
            <label className="mt-3 inline-block">
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.csv"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
              />
              <Button type="button" size="sm" disabled={uploading} className={cn('h-9', BRAND_BTN)} asChild>
                <span>{uploading ? 'Uploading…' : 'Choose file'}</span>
              </Button>
            </label>
          </div>

          {lastResult && (
            <p className="text-sm font-medium text-emerald-700">
              Last run: {lastResult.created} students created. Welcome emails queued.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
