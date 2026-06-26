'use client';

import { useCallback, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ExecutiveExportButton({
  targetId,
  filename = 'executive-export',
  label = 'Export',
}: {
  targetId: string;
  filename?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const exportSection = useCallback(async () => {
    const el = document.getElementById(targetId);
    if (!el) return;
    setBusy(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${filename}.pdf`);
    } catch {
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = '';
    } finally {
      setBusy(false);
    }
  }, [targetId, filename]);

  return (
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void exportSection()}>
      <Download className="mr-1.5 h-3.5 w-3.5" />
      {busy ? 'Exporting…' : label}
    </Button>
  );
}
