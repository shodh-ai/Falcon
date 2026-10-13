import { describe, expect, it } from 'vitest';
import { validateOnBehalfDates } from '../hr-on-behalf';

describe('validateOnBehalfDates', () => {
  const today = '2026-10-13';

  it('requires a single attendance date for regularization', () => {
    expect(validateOnBehalfDates({ request_type: 'REGULARIZATION', start_date: '', end_date: '', regularization_date: '' }, today)).toMatch(/attendance date/);
    expect(validateOnBehalfDates({ request_type: 'REGULARIZATION', start_date: '', end_date: '', regularization_date: '2026-10-14' }, today)).toMatch(/future/);
    expect(validateOnBehalfDates({ request_type: 'REGULARIZATION', start_date: '', end_date: '', regularization_date: '2026-10-12' }, today)).toMatch(/correction/);
    expect(validateOnBehalfDates({ request_type: 'REGULARIZATION', start_date: '', end_date: '', regularization_date: '2026-10-12', missed_punch_type: 'IN' }, today)).toBeNull();
  });

  it('requires an ordered date range for leave and on-duty', () => {
    expect(validateOnBehalfDates({ request_type: 'LEAVE', start_date: '2026-10-12', end_date: '', regularization_date: '' }, today)).toMatch(/both/);
    expect(validateOnBehalfDates({ request_type: 'ON_DUTY', start_date: '2026-10-14', end_date: '2026-10-13', regularization_date: '' }, today)).toMatch(/before/);
    expect(validateOnBehalfDates({ request_type: 'LEAVE', start_date: '2026-10-14', end_date: '2026-10-15', regularization_date: '' }, today)).toBeNull();
  });
});
