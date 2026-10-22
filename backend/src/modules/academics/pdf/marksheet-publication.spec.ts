import { ForbiddenException } from '@nestjs/common';
import { MarksheetPdfService } from './marksheet-pdf.service';

describe('Final marksheet publication gate', () => {
  it.each([
    null,
    { status: 'PUBLISHED', payload: { result_stage: 'PROVISIONAL' } },
  ])(
    'rejects a final PDF unless a final grade card exists: %o',
    async (gradeCard) => {
      const enrollments = { find: jest.fn() };
      const service = new MarksheetPdfService(
        {
          findOne: jest.fn().mockResolvedValue({ name: 'Synthetic student' }),
        } as never,
        { findOne: jest.fn().mockResolvedValue(null) } as never,
        enrollments as never,
        { find: jest.fn().mockResolvedValue([]) } as never,
        {
          query: jest.fn().mockResolvedValue(gradeCard ? [gradeCard] : []),
        } as never,
      );
      await expect(
        service.generate('student', 'tenant', 6, 'final'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(enrollments.find).not.toHaveBeenCalled();
    },
  );
});
