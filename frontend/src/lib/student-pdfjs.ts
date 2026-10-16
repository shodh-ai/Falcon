/** Load PDF.js as local ESM assets, avoiding the nested webpack runtimes in its bundle. */
export async function loadStudentPdfjs(): Promise<typeof import('pdfjs-dist')> {
  const moduleUrl = new URL('pdfjs-dist/legacy/build/pdf.min.mjs', import.meta.url).toString();
  const pdfjs = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl) as typeof import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url,
  ).toString();
  return pdfjs;
}
