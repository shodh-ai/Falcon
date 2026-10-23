'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authHeaders, getApiBaseUrl } from '@/lib/api/client';
import { Button } from '@/components/ui/button';

type DocumentResource = { kind: 'external'; href: string } | { kind: 'upload'; query: string; filename: string };

function uploadResource(value: string, key = false): DocumentResource {
  let filename = value.split('/').pop() || 'research-document';
  try { filename = decodeURIComponent(filename); } catch { /* Keep the stored filename. */ }
  return {
    kind: 'upload',
    query: `${key ? 'key' : 'path'}=${encodeURIComponent(value)}`,
    filename: filename.replace(/[^\w. -]/g, '_') || 'research-document',
  };
}

function documentResource(value: unknown): DocumentResource | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const text = value.trim();
  if (/^(?:\.\/|\/)?uploads\/(?!download\?)/.test(text)) return uploadResource(text);
  if (text.startsWith('/api/uploads/download?') || text.startsWith('/uploads/download?')) {
    const params = new URLSearchParams(text.slice(text.indexOf('?') + 1));
    const key = params.get('key');
    const path = params.get('path');
    return key ? uploadResource(key, true) : path ? uploadResource(path) : null;
  }
  try {
    const url = new URL(text);
    if (url.username || url.password) return null;
    if (url.protocol === 's3:' && url.hostname && url.pathname.length > 1) {
      return uploadResource(url.pathname.slice(1), true);
    }
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const apiOrigin = new URL(getApiBaseUrl()).origin;
    if (url.origin === apiOrigin) {
      if (['/api/uploads/download', '/uploads/download'].includes(url.pathname)) {
        const key = url.searchParams.get('key');
        const path = url.searchParams.get('path');
        return key ? uploadResource(key, true) : path ? uploadResource(path) : null;
      }
      if (url.pathname.startsWith('/uploads/')) return uploadResource(url.pathname);
    }
    return { kind: 'external', href: url.href };
  } catch {
    return null;
  }
}

export function FacultyResearchDocuments({ documents, documentScope }: { documents: Record<string, string>; documentScope: string }) {
  const { user, token } = useAuth();
  const scope = JSON.stringify([user?.user_id, user?.tenant_id, documentScope]);
  return <ResearchDocuments key={scope} storedDocuments={documents} token={token} />;
}

function ResearchDocuments({ storedDocuments, token }: { storedDocuments: Record<string, string>; token: string | null }) {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);

  async function download(label: string, resource: Extract<DocumentResource, { kind: 'upload' }>) {
    if (!token || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setDownloading(label);
    setError(null);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/uploads/download?${resource.query}`, {
        method: 'GET',
        cache: 'no-store',
        headers: authHeaders(token),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Document could not be downloaded. Check your access or retry.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement('a');
        link.href = url;
        link.download = resource.filename;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'Document download failed.');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setDownloading(null);
      }
    }
  }

  const documents = storedDocuments && typeof storedDocuments === 'object' && !Array.isArray(storedDocuments)
    ? Object.entries(storedDocuments)
    : [];
  return (
      <div className="space-y-2">
        <p className="font-medium">Supporting documents</p>
        {documents.length === 0 ? <p className="text-muted-foreground">No supporting documents submitted.</p> : (
          <ul className="space-y-2">
            {documents.map(([key, value]) => {
              const label = key.replace(/[_-]+/g, ' ').trim() || 'Document';
              const resource = documentResource(value);
              return (
                <li key={key} className="flex flex-wrap items-center gap-2">
                  <span>{label}</span>
                  {!resource ? <span className="text-muted-foreground">Document link unavailable</span> : resource.kind === 'external' ? (
                    <a className="text-sgvu-navy underline" href={resource.href} target="_blank" rel="noopener noreferrer">Open {label}</a>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={!token || downloading !== null} onClick={() => void download(key, resource)}>
                      {downloading === key ? 'Downloading…' : `Download ${label}`}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {documents.some(([, value]) => documentResource(value)?.kind === 'upload') && !token ? <p className="text-muted-foreground">Sign in to download uploaded documents.</p> : null}
        {error ? <p role="alert" className="text-destructive">{error}</p> : null}
      </div>
  );
}
