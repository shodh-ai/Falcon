import { evaluateThreeWayMatch } from './three-way-match.util';

describe('evaluateThreeWayMatch edge cases', () => {
  it('rejects non-approved PO', () => {
    expect(
      evaluateThreeWayMatch({
        poStatus: 'PENDING',
        poAmount: 500,
        hasGrn: true,
        invoiceCount: 1,
        invoiceAmount: 500,
      }),
    ).toEqual({ match_status: 'PO_NOT_APPROVED', can_pay: false });
  });

  it('allows tiny floating rounding within 0.01', () => {
    expect(
      evaluateThreeWayMatch({
        poStatus: 'APPROVED',
        poAmount: 100.001,
        hasGrn: true,
        invoiceCount: 1,
        invoiceAmount: 100.0,
      }).can_pay,
    ).toBe(true);
  });
});
