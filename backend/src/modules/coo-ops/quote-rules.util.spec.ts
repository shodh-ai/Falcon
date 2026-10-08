import {
  BOARD_ESCALATION_AMOUNT,
  computeSystemL1,
  needsBoardEscalation,
  resolveQuoteRule,
} from './quote-rules.util';

describe('quote-rules.util', () => {
  it('requires 1 quote under 50k', () => {
    expect(resolveQuoteRule(25000).min_quotes).toBe(1);
  });

  it('requires 3 quotes between 50k and 5L', () => {
    expect(resolveQuoteRule(50000).min_quotes).toBe(3);
    expect(resolveQuoteRule(499999).min_quotes).toBe(3);
    expect(resolveQuoteRule(500000).min_quotes).toBe(3);
  });

  it('requires 3 quotes and board escalation above 5L', () => {
    expect(resolveQuoteRule(500000.01).min_quotes).toBe(3);
    expect(needsBoardEscalation(BOARD_ESCALATION_AMOUNT + 1)).toBe(true);
    expect(needsBoardEscalation(BOARD_ESCALATION_AMOUNT)).toBe(false);
  });

  it('picks lowest amount as system L1', () => {
    expect(
      computeSystemL1([
        { quote_id: 'a', amount_inr: 120000 },
        { quote_id: 'b', amount_inr: 100000 },
        { quote_id: 'c', amount_inr: 150000 },
      ]),
    ).toBe('b');
  });
});
