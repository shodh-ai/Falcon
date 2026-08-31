import { createHash } from 'crypto';

const MONEY_LIMIT = 999_999_999_999_99n;

export function minorUnits(value: unknown): bigint {
  const raw =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '0';
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Invalid monetary value');
  const [whole, fraction = ''] = raw.split('.');
  const padded = `${fraction}000`;
  let result = BigInt(whole) * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) result += 1n;
  if (result < 0n || result > MONEY_LIMIT)
    throw new Error('Invalid monetary value');
  return result;
}

export function money(value: unknown): number {
  return Number(minorUnits(value)) / 100;
}

export function quantityUnits(value: unknown): bigint {
  const raw =
    typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : typeof value === 'string'
        ? value.trim()
        : '';
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Invalid quantity');
  const [whole, fraction = ''] = raw.split('.');
  const padded = `${fraction}0000`;
  let result = BigInt(whole) * 1000n + BigInt(padded.slice(0, 3));
  if (Number(padded[3]) >= 5) result += 1n;
  if (result < 0n || result > 1_000_000_000n)
    throw new Error('Invalid quantity');
  return result;
}

export function lineTotal(input: {
  quantity: unknown;
  unit_price: unknown;
  tax_amount?: unknown;
  freight_amount?: unknown;
  additional_charges?: unknown;
}) {
  const quantity = quantityUnits(input.quantity);
  if (quantity <= 0n) throw new Error('Quantity must be greater than zero');
  const product = (quantity * minorUnits(input.unit_price) + 500n) / 1000n;
  const total =
    product +
    minorUnits(input.tax_amount) +
    minorUnits(input.freight_amount) +
    minorUnits(input.additional_charges);
  return {
    product: Number(product) / 100,
    tax: money(input.tax_amount),
    freight: money(input.freight_amount),
    additional: money(input.additional_charges),
    total: Number(total) / 100,
  };
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

export function hash(value: unknown) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function withinTolerance(
  actual: unknown,
  expected: unknown,
  tolerancePercent: unknown,
  roundingTolerance: unknown,
) {
  const a = minorUnits(actual);
  const e = minorUnits(expected);
  const diff = a >= e ? a - e : e - a;
  const percent = Number(tolerancePercent ?? 0);
  const allowedByPercent = BigInt(Math.round((Number(e) * percent) / 100));
  return diff <= allowedByPercent + minorUnits(roundingTolerance);
}

export type FinancialBucket =
  | 'AVAILABLE'
  | 'COMMITTED'
  | 'EXPENDED'
  | 'RELEASED';
export type BucketBalances = Record<FinancialBucket, number | string>;

export function moveBuckets(
  balances: BucketBalances,
  from: FinancialBucket,
  to: FinancialBucket,
  amountInput: unknown,
) {
  if (from === to) throw new Error('Financial buckets must differ');
  const amount = minorUnits(amountInput);
  if (amount <= 0n) throw new Error('Financial movement must be positive');
  const before = Object.fromEntries(
    Object.entries(balances).map(([key, value]) => [key, minorUnits(value)]),
  ) as Record<FinancialBucket, bigint>;
  if (before[from] < amount) throw new Error(`Insufficient ${from} balance`);
  const after = { ...before };
  after[from] -= amount;
  after[to] += amount;
  const beforeTotal = Object.values(before).reduce(
    (sum, value) => sum + value,
    0n,
  );
  const afterTotal = Object.values(after).reduce(
    (sum, value) => sum + value,
    0n,
  );
  if (beforeTotal !== afterTotal)
    throw new Error('Financial bucket invariant violated');
  return Object.fromEntries(
    Object.entries(after).map(([key, value]) => [key, Number(value) / 100]),
  ) as Record<FinancialBucket, number>;
}
