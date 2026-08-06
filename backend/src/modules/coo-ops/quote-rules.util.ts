export type QuoteRule = {
  min_amount_inr: number;
  max_amount_inr: number | null;
  min_quotes: number;
  require_gst_verify: boolean;
};

/** Defaults when fin_quote_rules has no row for tenant */
export const DEFAULT_QUOTE_RULES: QuoteRule[] = [
  { min_amount_inr: 0, max_amount_inr: 49999.99, min_quotes: 1, require_gst_verify: true },
  { min_amount_inr: 50000, max_amount_inr: 500000, min_quotes: 3, require_gst_verify: true },
  {
    min_amount_inr: 500000.01,
    max_amount_inr: null,
    min_quotes: 3,
    require_gst_verify: true,
  },
];

export const BOARD_ESCALATION_AMOUNT = 500000;
export const L2_JUSTIFICATION_MIN_CHARS = 20;

export function resolveQuoteRule(
  amount: number,
  rules: QuoteRule[] = DEFAULT_QUOTE_RULES,
): QuoteRule {
  const sorted = [...rules].sort((a, b) => a.min_amount_inr - b.min_amount_inr);
  for (const rule of sorted) {
    const max = rule.max_amount_inr;
    if (amount >= rule.min_amount_inr && (max == null || amount <= max)) {
      return rule;
    }
  }
  return sorted[sorted.length - 1] ?? DEFAULT_QUOTE_RULES[DEFAULT_QUOTE_RULES.length - 1];
}

export type QuoteAmount = { quote_id: string; amount_inr: number };

export function computeSystemL1(quotes: QuoteAmount[]): string | null {
  if (!quotes.length) return null;
  let best = quotes[0];
  for (const q of quotes) {
    if (Number(q.amount_inr) < Number(best.amount_inr)) best = q;
  }
  return best.quote_id;
}

export function needsBoardEscalation(amount: number): boolean {
  return amount > BOARD_ESCALATION_AMOUNT;
}
