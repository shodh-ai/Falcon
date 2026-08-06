export type ThreeWayInputs = {
  poStatus: string;
  poAmount: number;
  hasGrn: boolean;
  invoiceAmount: number;
  invoiceCount: number;
};

export type ThreeWayResult = {
  match_status:
    | 'MATCHED'
    | 'MISSING_GRN'
    | 'MISSING_INVOICE'
    | 'AMOUNT_MISMATCH'
    | 'PO_NOT_APPROVED';
  can_pay: boolean;
};

/** Pure 3-way match gate used by finance payment paths. */
export function evaluateThreeWayMatch(input: ThreeWayInputs): ThreeWayResult {
  if (input.poStatus !== 'APPROVED') {
    return { match_status: 'PO_NOT_APPROVED', can_pay: false };
  }
  if (!input.hasGrn) {
    return { match_status: 'MISSING_GRN', can_pay: false };
  }
  if (input.invoiceCount <= 0) {
    return { match_status: 'MISSING_INVOICE', can_pay: false };
  }
  if (Math.abs(input.invoiceAmount - input.poAmount) >= 0.01) {
    return { match_status: 'AMOUNT_MISMATCH', can_pay: false };
  }
  return { match_status: 'MATCHED', can_pay: true };
}
