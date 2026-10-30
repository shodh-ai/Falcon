import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateExamSessionDto,
  EXAM_SESSION_CYCLES,
  UpdateExamSessionStatusDto,
} from './exam-session.dto';

describe('exam session DTO validation', () => {
  const valid = {
    academic_year: '2026-27',
    session_name: 'End semester examination',
    cycle_type: 'END_SEMESTER',
    semester: 4,
    start_date: '2026-11-01',
    end_date: '2026-11-30',
  };

  it('accepts every existing cycle and does not invent an academic-year format', () => {
    for (const cycle_type of EXAM_SESSION_CYCLES) {
      const input = plainToInstance(CreateExamSessionDto, {
        ...valid,
        academic_year: 'AY 26',
        cycle_type,
      });
      expect(validateSync(input)).toEqual([]);
    }
  });

  it('trims labels and normalizes blank optional dates and programme', () => {
    const input = plainToInstance(CreateExamSessionDto, {
      ...valid,
      session_name: '  End semester  ',
      start_date: '',
      end_date: '   ',
      program_label: ' ',
    });
    expect(validateSync(input)).toEqual([]);
    expect(input.session_name).toBe('End semester');
    expect(input.start_date).toBeUndefined();
    expect(input.end_date).toBeUndefined();
    expect(input.program_label).toBeUndefined();
  });

  it.each([
    ['session_name', ' '],
    ['academic_year', ''],
    ['academic_year', 'x'.repeat(13)],
    ['session_name', 'x'.repeat(121)],
    ['program_label', 'x'.repeat(81)],
    ['cycle_type', 'UNKNOWN'],
    ['semester', 0],
    ['semester', -1],
    ['semester', 1.5],
    ['semester', 2147483648],
    ['semester', '4'],
    ['start_date', '2026-02-30'],
    ['end_date', '2026-13-01'],
    ['start_date', '2026-11-01T12:00:00Z'],
    ['end_date', 'invalid'],
    ['status', 'ACTIVE'],
  ])('rejects invalid %s: %s', (field, value) => {
    const errors = validateSync(
      plainToInstance(CreateExamSessionDto, { ...valid, [field]: value }),
    );
    expect(errors.map((error) => error.property)).toContain(field);
  });

  it('accepts only a draft creation status', () => {
    expect(
      validateSync(
        plainToInstance(CreateExamSessionDto, { ...valid, status: 'DRAFT' }),
      ),
    ).toEqual([]);
  });

  it('accepts the PostgreSQL integer boundary without inventing a programme semester limit', () => {
    expect(
      validateSync(
        plainToInstance(CreateExamSessionDto, {
          ...valid,
          semester: 2147483647,
        }),
      ),
    ).toEqual([]);
  });

  it('rejects missing or unknown status updates', () => {
    for (const status of [undefined, '', 'PUBLISHED']) {
      expect(
        validateSync(plainToInstance(UpdateExamSessionStatusDto, { status })),
      ).toHaveLength(1);
    }
  });
});
