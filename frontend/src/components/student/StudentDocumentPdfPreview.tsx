'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import { loadStudentPdfjs } from '@/lib/student-pdfjs';

type DocumentState = {
  blob: Blob;
  document?: PDFDocumentProxy;
  error?: string;
};

type PageState = {
  document: PDFDocumentProxy;
  page: number;
  width: number;
  error?: string;
};

/** Renders the authenticated file supplied by the parent without fetching a document URL. */
export function StudentDocumentPdfPreview({ blob, title }: { blob: Blob; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState<DocumentState | null>(null);
  const [selection, setSelection] = useState<{ blob: Blob; page: number } | null>(null);
  const [rendered, setRendered] = useState<PageState | null>(null);

  const document = loaded?.blob === blob ? loaded.document : undefined;
  const loadError = loaded?.blob === blob ? loaded.error : undefined;
  const pageNumber = selection?.blob === blob ? selection.page : 1;
  const currentRender = rendered?.document === document
    && rendered?.page === pageNumber && rendered?.width === width ? rendered : null;
  const error = loadError ?? currentRender?.error;
  const ready = Boolean(currentRender && !error);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => setWidth(Math.max(0, Math.floor(container.getBoundingClientRect().width)));
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(0, Math.floor(entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;

    async function loadDocument() {
      try {
        const [pdfjs, data] = await Promise.all([loadStudentPdfjs(), blob.arrayBuffer()]);
        if (!active) return;
        loadingTask = pdfjs.getDocument({
          data: new Uint8Array(data),
          isEvalSupported: false,
        });
        const pdf = await loadingTask.promise;
        if (active) setLoaded({ blob, document: pdf });
      } catch {
        if (active) setLoaded({
          blob,
          error: 'This PDF could not be previewed. You can still open or download the original file.',
        });
      }
    }

    void loadDocument();
    return () => {
      active = false;
      void loadingTask?.destroy().catch(() => undefined);
    };
  }, [blob]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas || width <= 0) return;
    let active = true;
    let renderTask: RenderTask | undefined;

    async function renderPage() {
      try {
        const page = await document!.getPage(pageNumber);
        if (!active) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / original.width });
        // Limit backing pixels on high-DPI/mobile displays while preserving the fitted size.
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas!.width = Math.floor(viewport.width * outputScale);
        canvas!.height = Math.floor(viewport.height * outputScale);
        canvas!.style.width = `${Math.floor(viewport.width)}px`;
        canvas!.style.height = `${Math.floor(viewport.height)}px`;
        renderTask = page.render({
          canvas: canvas!,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await renderTask.promise;
        if (active) setRendered({ document: document!, page: pageNumber, width });
      } catch {
        if (active) setRendered({
          document: document!, page: pageNumber, width,
          error: 'This page could not be previewed. You can still open or download the original file.',
        });
      }
    }

    void renderPage();
    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [document, pageNumber, width]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-sgvu-navy/10 bg-slate-100">
      {document && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-sgvu-navy/10 bg-white p-2">
          <Button type="button" variant="outline" size="sm" disabled={pageNumber <= 1}
            onClick={() => setSelection({ blob, page: pageNumber - 1 })} aria-label="Previous PDF page">
            <ChevronLeft aria-hidden="true" /> Previous
          </Button>
          <span className="text-xs font-medium text-sgvu-navy" aria-live="polite">
            Page {pageNumber} of {document.numPages}
          </span>
          <Button type="button" variant="outline" size="sm" disabled={pageNumber >= document.numPages}
            onClick={() => setSelection({ blob, page: pageNumber + 1 })} aria-label="Next PDF page">
            Next <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-2 sm:p-3">
        <div ref={containerRef} className="relative min-h-48 w-full" aria-busy={!ready && !error}>
          {!ready && !error && (
            <div role="status" className="flex min-h-48 items-center justify-center gap-2 text-sm text-sgvu-navy">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading preview…
            </div>
          )}
          {error && <p role="alert" className="p-4 text-sm text-sgvu-navy">{error}</p>}
          {document && (
            <canvas key={`${pageNumber}:${width}`} ref={canvasRef} role="img"
              aria-label={`${title}, page ${pageNumber} of ${document.numPages}`}
              className={ready ? 'mx-auto max-w-full bg-white shadow-sm' : 'invisible absolute left-0 top-0 max-w-full'}>
              Open or download the original file to read this document.
            </canvas>
          )}
        </div>
      </div>
    </div>
  );
}
