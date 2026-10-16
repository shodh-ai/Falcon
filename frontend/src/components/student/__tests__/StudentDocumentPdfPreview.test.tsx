import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentDocumentPdfPreview } from '@/components/student/StudentDocumentPdfPreview';

const pdfjs = vi.hoisted(() => ({ getDocument: vi.fn() }));
const loadStudentPdfjs = vi.hoisted(() => vi.fn());
vi.mock('@/lib/student-pdfjs', () => ({ loadStudentPdfjs }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function pdfBlob() {
  return Object.assign(new Blob(['%PDF-test'], { type: 'application/pdf' }), {
    arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([37, 80, 68, 70]).buffer),
  });
}

function mockDocument(pages = 3) {
  const renderTask = { promise: Promise.resolve(), cancel: vi.fn() };
  const page = {
    getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale })),
    render: vi.fn().mockReturnValue(renderTask),
  };
  const document = { numPages: pages, getPage: vi.fn().mockResolvedValue(page) };
  const task = { promise: Promise.resolve(document), destroy: vi.fn().mockResolvedValue(undefined) };
  pdfjs.getDocument.mockReturnValue(task);
  return { document, page, renderTask, task };
}

let resize: ResizeObserverCallback;
let disconnect: ReturnType<typeof vi.fn>;

describe('StudentDocumentPdfPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadStudentPdfjs.mockResolvedValue(pdfjs);
    disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect() { disconnect(); }
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 600 } as DOMRect);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders authenticated PDF bytes locally and navigates actual pages within bounds', async () => {
    const { document, page } = mockDocument();
    render(<StudentDocumentPdfPreview blob={pdfBlob()} title="Fee receipt" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading preview');
    const first = await screen.findByRole('img', { name: 'Fee receipt, page 1 of 3' });
    await waitFor(() => expect(first).not.toHaveClass('invisible'));
    expect(pdfjs.getDocument).toHaveBeenCalledWith({ data: new Uint8Array([37, 80, 68, 70]), isEvalSupported: false });
    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({ canvas: first }));
    expect(screen.getByRole('button', { name: 'Previous PDF page' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Next PDF page' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Fee receipt, page 2 of 3' })).not.toHaveClass('invisible'));
    expect(document.getPage).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByRole('button', { name: 'Next PDF page' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Fee receipt, page 3 of 3' })).not.toHaveClass('invisible'));
    expect(screen.getByRole('button', { name: 'Next PDF page' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Previous PDF page' }));
    await waitFor(() => expect(document.getPage).toHaveBeenLastCalledWith(2));
  });

  it('fits resized containers and caps high-DPI backing pixels', async () => {
    vi.stubGlobal('devicePixelRatio', 3);
    const { page, renderTask } = mockDocument(1);
    render(<StudentDocumentPdfPreview blob={pdfBlob()} title="Transcript" />);
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    act(() => resize([{ contentRect: { width: 300 } } as ResizeObserverEntry], {} as ResizeObserver));

    await waitFor(() => expect(page.getViewport).toHaveBeenLastCalledWith({ scale: 0.5 }));
    const canvas = screen.getByRole('img') as HTMLCanvasElement;
    await waitFor(() => expect(canvas).not.toHaveClass('invisible'));
    expect(canvas.style.width).toBe('300px');
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(800);
    expect(renderTask.cancel).toHaveBeenCalled();
  });

  it('shows a usable fallback when document decoding fails without exposing internal errors', async () => {
    const task = { promise: Promise.reject(new Error('private storage path')), destroy: vi.fn().mockResolvedValue(undefined) };
    pdfjs.getDocument.mockReturnValue(task);
    render(<StudentDocumentPdfPreview blob={pdfBlob()} title="Certificate" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('You can still open or download the original file');
    expect(screen.queryByText(/private storage path/)).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a page fallback when rendering fails and allows navigating to another page', async () => {
    const { page } = mockDocument(2);
    page.render.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('canvas failed')), cancel: vi.fn() }));
    render(<StudentDocumentPdfPreview blob={pdfBlob()} title="Receipt" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('This page could not be previewed');
    fireEvent.click(screen.getByRole('button', { name: 'Next PDF page' }));
    await waitFor(() => expect(screen.getByRole('img', { name: 'Receipt, page 2 of 2' })).not.toHaveClass('invisible'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('cancels rendering, destroys the loading task, and disconnects measurement on close', async () => {
    const { page, task } = mockDocument();
    const pendingRender = deferred<void>();
    const cancel = vi.fn(() => pendingRender.reject(new Error('Rendering cancelled')));
    page.render.mockReturnValue({ promise: pendingRender.promise, cancel });
    const { unmount } = render(<StudentDocumentPdfPreview blob={pdfBlob()} title="Receipt" />);
    await waitFor(() => expect(page.render).toHaveBeenCalled());

    unmount();
    expect(cancel).toHaveBeenCalledOnce();
    expect(task.destroy).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    await act(async () => { await Promise.resolve(); });
  });

  it('discards a late previous document after the selected file changes', async () => {
    const oldLoad = deferred<{ numPages: number; getPage: ReturnType<typeof vi.fn> }>();
    const oldDocument = { numPages: 9, getPage: vi.fn() };
    const oldTask = { promise: oldLoad.promise, destroy: vi.fn().mockResolvedValue(undefined) };
    pdfjs.getDocument.mockReturnValueOnce(oldTask);
    const { rerender } = render(<StudentDocumentPdfPreview blob={pdfBlob()} title="Old document" />);
    await waitFor(() => expect(pdfjs.getDocument).toHaveBeenCalledOnce());

    const current = mockDocument(2);
    rerender(<StudentDocumentPdfPreview blob={pdfBlob()} title="New document" />);
    await waitFor(() => expect(screen.getByRole('img', { name: 'New document, page 1 of 2' })).not.toHaveClass('invisible'));
    await act(async () => oldLoad.resolve(oldDocument));
    expect(oldTask.destroy).toHaveBeenCalledOnce();
    expect(oldDocument.getPage).not.toHaveBeenCalled();
    expect(current.document.getPage).toHaveBeenCalledWith(1);
    expect(screen.queryByText('Page 1 of 9')).not.toBeInTheDocument();
  });
});
