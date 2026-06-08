'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Download, Eye, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { useHrApi } from '@/lib/api/use-hr-api';
import { getSubdomainFromClient } from '@/lib/tenant';
import type { VaultDocument, VaultResponse } from '@/lib/api/api.hr-documents';
import { HR_DOCUMENT_CATEGORIES } from '@/lib/api/api.hr-documents';

type Props = {
  userId?: string;
  mode: 'hr' | 'ess';
  onRefresh?: () => void;
};

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'VERIFIED') return 'default';
  if (status === 'REJECTED') return 'destructive';
  return 'secondary';
}

export function DocumentVaultGrid({ userId, mode }: Props) {
  const api = useHrApi();
  const { token } = useAuth();
  const [vault, setVault] = useState<VaultResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadType, setUploadType] = useState('AADHAAR');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const path =
        mode === 'hr' && userId
          ? `/api/hr/employees/${userId}/documents`
          : '/api/hr/ess/documents';
      const data = await api.get<VaultResponse>(path);
      setVault(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [api, mode, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function secureDownload(docId: string) {
    if (!token) return;
    try {
      const meta = await api.get<{
        url: string;
        delivery?: 'presigned' | 'authenticated';
        file_name?: string | null;
      }>(`/api/hr/documents/${docId}/download`);

      if (meta.delivery !== 'authenticated' && meta.url.startsWith('http')) {
        window.open(meta.url, '_blank', 'noopener,noreferrer');
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
      const streamPath = meta.url.startsWith('http')
        ? meta.url
        : `${apiUrl}${meta.url.startsWith('/') ? meta.url : `/api/hr/documents/${docId}/file`}`;
      const res = await fetch(streamPath, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || 'Download failed');
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  }

  async function verify(docId: string, status: 'VERIFIED' | 'REJECTED') {
    try {
      await api.patch(`/api/hr/documents/${docId}/verify`, { status });
      toast.success(status === 'VERIFIED' ? 'Document verified' : 'Document rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    }
  }

  async function uploadFile(file: File) {
    if (!token) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? '';
      const uploadRes = await fetch(`${apiUrl}/uploads/single`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
        body: formData,
      });
      if (!uploadRes.ok) throw new Error('File upload failed');
      const uploaded = (await uploadRes.json()) as { url?: string; path?: string };
      const fileUrl = uploaded.url ?? uploaded.path ?? '';
      const postPath =
        mode === 'hr' && userId
          ? `/api/hr/employees/${userId}/documents`
          : '/api/hr/ess/documents';
      await api.post(postPath, {
        document_type: uploadType,
        file_url: fileUrl,
        file_name: file.name,
      });
      toast.success('Document uploaded');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading document vault…</p>;
  if (!vault) return null;

  const groupOrder = ['Identity', 'Academic', 'Financial', 'HR Letters', 'Other'];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Document</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value)}
          >
            {HR_DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <label className="cursor-pointer">
            <Button size="sm" variant="outline" disabled={uploading} asChild>
              <span>
                <Upload className="mr-1 h-4 w-4" />
                {uploading ? 'Uploading…' : 'Choose file'}
              </span>
            </Button>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
              }}
            />
          </label>
        </CardContent>
      </Card>

      {groupOrder.map((group) => {
        const docs = vault.groups[group] ?? [];
        if (!docs.length) return null;
        return (
          <section key={group}>
            <h3 className="mb-3 text-sm font-semibold text-sgvu-navy">{group}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((doc: VaultDocument) => (
                <Card key={doc.document_id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">{doc.document_type.replace(/_/g, ' ')}</CardTitle>
                      <Badge variant={statusVariant(doc.verification_status)}>{doc.verification_status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="truncate text-muted-foreground">{doc.file_name ?? 'Document'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.uploaded_at).toLocaleDateString()}
                      {doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void secureDownload(doc.document_id)}>
                        <Eye className="mr-1 h-3 w-3" />
                        Preview
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void secureDownload(doc.document_id)}>
                        <Download className="mr-1 h-3 w-3" />
                        Download
                      </Button>
                      {mode === 'hr' && doc.verification_status === 'PENDING' && (
                        <Button size="sm" onClick={() => void verify(doc.document_id, 'VERIFIED')}>
                          <Check className="mr-1 h-3 w-3" />
                          Verify
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        );
      })}

      {!vault.documents.length && (
        <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
      )}
    </div>
  );
}
