import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AcquisitionDetail } from '@/lib/api/api.acquisitions';
import { AcquisitionDraftEditor } from '../AcquisitionDraftEditor';

const detail = {
  acquisition_number: 'ACQ-2026-000009',
  required_by_date: '2026-10-01',
  intended_use_case: 'Computer laboratory',
  lines: [
    {
      line_id: 'line-3',
      product_name: 'Printer',
      intended_use: '',
      technical_specifications: { description: 'Laser printer' },
    },
  ],
} as AcquisitionDetail;

describe('AcquisitionDraftEditor', () => {
  it('lets the requester correct the required date and missing line intended use', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<AcquisitionDraftEditor detail={detail} busy={false} onCancel={vi.fn()} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Required-by date'), { target: { value: '2026-11-15' } });
    fireEvent.change(screen.getByLabelText('Line 1 intended use'), { target: { value: 'Administrative printing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      required_by_date: '2026-11-15',
      lines: [expect.objectContaining({ line_id: 'line-3', intended_use: 'Administrative printing' })],
    })));
  });
});
