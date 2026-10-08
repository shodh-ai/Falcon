import { evaluateThreeWayMatch } from './three-way-match.util';

describe('evaluateThreeWayMatch', () => {
  it('blocks unpaid without GRN', () => {
    expect(
      evaluateThreeWayMatch({
        poStatus: 'APPROVED',
        poAmount: 1000,
        hasGrn: false,
        invoiceCount: 1,
        invoiceAmount: 1000,
      }),
    ).toEqual({ match_status: 'MISSING_GRN', can_pay: false });
  });

  it('blocks without invoice', () => {
    expect(
      evaluateThreeWayMatch({
        poStatus: 'APPROVED',
        poAmount: 1000,
        hasGrn: true,
        invoiceCount: 0,
        invoiceAmount: 0,
      }),
    ).toEqual({ match_status: 'MISSING_INVOICE', can_pay: false });
  });

  it('blocks amount mismatch', () => {
    expect(
      evaluateThreeWayMatch({
        poStatus: 'APPROVED',
        poAmount: 1000,
        hasGrn: true,
        invoiceCount: 1,
        invoiceAmount: 900,
      }),
    ).toEqual({ match_status: 'AMOUNT_MISMATCH', can_pay: false });
  });

  it('allows pay when PO+GRN+invoice match', () => {
    expect(
      evaluateThreeWayMatch({
        poStatus: 'APPROVED',
        poAmount: 1000,
        hasGrn: true,
        invoiceCount: 1,
        invoiceAmount: 1000,
      }),
    ).toEqual({ match_status: 'MATCHED', can_pay: true });
  });
});
