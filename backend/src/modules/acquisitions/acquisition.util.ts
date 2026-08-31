import { createHash } from 'crypto';
import type {
  AcquisitionLineInput,
  CreateAcquisitionInput,
  VendorScoreInput,
  VendorScoreWeights,
} from './acquisition.types';

const MONEY_LIMIT = 999_999_999_999.99;

function scaledInteger(value: unknown, scale: number): bigint {
  let raw: string;
  if (value == null) raw = '0';
  else if (typeof value === 'string') raw = value.trim();
  else if (typeof value === 'number' || typeof value === 'bigint')
    raw = value.toString();
  else throw new Error('Invalid numeric value');
  if (!/^\d+(?:\.\d+)?$/.test(raw)) throw new Error('Invalid numeric value');
  const [whole, fraction = ''] = raw.split('.');
  const padded = `${fraction}${'0'.repeat(scale + 1)}`;
  let result =
    BigInt(whole) * 10n ** BigInt(scale) +
    BigInt(padded.slice(0, scale) || '0');
  if (Number(padded[scale] ?? '0') >= 5) result += 1n;
  return result;
}

function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}

export function money(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > MONEY_LIMIT) {
    throw new Error('Invalid monetary value');
  }
  return fromCents(scaledInteger(value, 2));
}

export function calculateLine(line: AcquisitionLineInput) {
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) {
    throw new Error('Quantity must be greater than zero');
  }
  const quantityThousandths = scaledInteger(line.quantity, 3);
  const unitCents = scaledInteger(line.estimated_unit_price, 2);
  const productCents = (unitCents * quantityThousandths + 500n) / 1000n;
  const deliveryCents = scaledInteger(line.delivery_cost, 2);
  const taxCents = scaledInteger(line.tax_cost, 2);
  const installationCents = scaledInteger(line.installation_cost, 2);
  const serviceCents = scaledInteger(line.service_cost, 2);
  const miscellaneousCents = scaledInteger(line.miscellaneous_cost, 2);
  const product = fromCents(productCents);
  const delivery = fromCents(deliveryCents);
  const tax = fromCents(taxCents);
  const installation = fromCents(installationCents);
  const service = fromCents(serviceCents);
  const miscellaneous = fromCents(miscellaneousCents);
  return {
    product,
    delivery,
    tax,
    installation,
    service,
    miscellaneous,
    total: fromCents(
      productCents +
        deliveryCents +
        taxCents +
        installationCents +
        serviceCents +
        miscellaneousCents,
    ),
  };
}

export function calculateAcquisition(lines: AcquisitionLineInput[]) {
  const totals = lines.map(calculateLine);
  return totals.reduce(
    (sum, row) => ({
      product: fromCents(
        scaledInteger(sum.product, 2) + scaledInteger(row.product, 2),
      ),
      delivery: fromCents(
        scaledInteger(sum.delivery, 2) + scaledInteger(row.delivery, 2),
      ),
      tax: fromCents(scaledInteger(sum.tax, 2) + scaledInteger(row.tax, 2)),
      installation: fromCents(
        scaledInteger(sum.installation, 2) + scaledInteger(row.installation, 2),
      ),
      service: fromCents(
        scaledInteger(sum.service, 2) + scaledInteger(row.service, 2),
      ),
      miscellaneous: fromCents(
        scaledInteger(sum.miscellaneous, 2) +
          scaledInteger(row.miscellaneous, 2),
      ),
      total: fromCents(
        scaledInteger(sum.total, 2) + scaledInteger(row.total, 2),
      ),
    }),
    {
      product: 0,
      delivery: 0,
      tax: 0,
      installation: 0,
      service: 0,
      miscellaneous: 0,
      total: 0,
    },
  );
}

function text(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value.toString().trim();
  }
  return '';
}

export function assertSafeAcquisitionInput(input: CreateAcquisitionInput) {
  const bounded = (value: unknown, max: number, field: string) => {
    if (text(value).length > max)
      throw new Error(`${field} exceeds ${max} characters`);
  };
  const currency = text(input.currency || 'INR').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    throw new Error('currency must be a 3-letter ISO code');
  bounded(input.intended_use_case, 5_000, 'intended_use_case');
  bounded(input.intended_lab_or_project, 255, 'intended_lab_or_project');
  bounded(
    input.special_procurement_requirements,
    10_000,
    'special_procurement_requirements',
  );
  bounded(input.remarks, 10_000, 'remarks');
  for (const [index, line] of (input.lines ?? []).entries()) {
    const prefix = `Line ${index + 1}`;
    bounded(line.product_name, 255, `${prefix} product_name`);
    bounded(line.category, 120, `${prefix} category`);
    bounded(line.unit, 40, `${prefix} unit`);
    bounded(line.brand, 160, `${prefix} brand`);
    bounded(line.model_number, 160, `${prefix} model_number`);
    bounded(line.part_number, 160, `${prefix} part_number`);
    bounded(line.product_description, 10_000, `${prefix} product_description`);
    bounded(line.intended_use, 5_000, `${prefix} intended_use`);
    bounded(
      line.special_procurement_requirements,
      10_000,
      `${prefix} special_procurement_requirements`,
    );
    bounded(line.product_url, 2_048, `${prefix} product_url`);
    bounded(
      line.policy_source_reference,
      2_048,
      `${prefix} policy_source_reference`,
    );
    for (const [field, value] of [
      ['return_window_days', line.return_window_days],
      ['doa_window_days', line.doa_window_days],
    ] as const) {
      if (
        value != null &&
        (!Number.isInteger(Number(value)) ||
          Number(value) < 0 ||
          Number(value) > 36_500)
      )
        throw new Error(`${prefix} ${field} is invalid`);
    }
    if (
      line.expected_delivery_days != null &&
      (!Number.isInteger(Number(line.expected_delivery_days)) ||
        Number(line.expected_delivery_days) < 0 ||
        Number(line.expected_delivery_days) > 36_500)
    ) {
      throw new Error(`${prefix} expected_delivery_days is invalid`);
    }
  }
}

export function validateAcquisition(input: CreateAcquisitionInput) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!text(input.intended_use_case))
    errors.push('intended_use_case is required');
  if (!text(input.required_by_date))
    errors.push('required_by_date is required');
  else {
    const required = new Date(`${input.required_by_date}T00:00:00Z`);
    if (Number.isNaN(required.getTime()))
      errors.push('required_by_date is invalid');
    if (required.getTime() < new Date().setUTCHours(0, 0, 0, 0)) {
      errors.push('required_by_date cannot be in the past');
    }
  }
  if (!text(input.funding_source_id))
    errors.push('funding_source_id is required');
  if (!Array.isArray(input.lines) || input.lines.length < 1) {
    errors.push('At least one product line is required');
  }
  if (input.lines?.length > 500)
    errors.push('At most 500 product lines are allowed');

  const lineResults = (input.lines ?? []).map((line, index) => {
    const lineErrors: string[] = [];
    const lineWarnings: string[] = [];
    if (!text(line.product_name)) lineErrors.push('product_name is required');
    if (!text(line.category)) lineErrors.push('category is required');
    if (!text(line.intended_use)) lineErrors.push('intended_use is required');
    if (!['ONLINE', 'OFFLINE', 'GENERAL'].includes(line.acquisition_layout)) {
      lineErrors.push('acquisition_layout is invalid');
    }
    if (
      !['ASSET', 'CONSUMABLE', 'SERVICE'].includes(line.item_classification)
    ) {
      lineErrors.push('item_classification is invalid');
    }
    try {
      calculateLine(line);
    } catch (error) {
      lineErrors.push(error instanceof Error ? error.message : 'Invalid cost');
    }
    if (line.acquisition_layout === 'ONLINE') {
      if (!text(line.product_url))
        lineErrors.push('product_url is required for online acquisitions');
      else {
        try {
          const url = new URL(line.product_url!);
          if (url.protocol !== 'https:')
            lineErrors.push('product_url must use HTTPS');
          if (url.username || url.password)
            lineErrors.push('product_url cannot contain credentials');
        } catch {
          lineErrors.push('product_url is invalid');
        }
      }
    }
    if (
      line.acquisition_layout === 'OFFLINE' &&
      !text(line.preferred_vendor_name)
    ) {
      lineWarnings.push('Offline acquisition has no preferred vendor');
    }
    return { line: index + 1, errors: lineErrors, warnings: lineWarnings };
  });

  for (const result of lineResults) {
    errors.push(...result.errors.map((e) => `Line ${result.line}: ${e}`));
    warnings.push(...result.warnings.map((e) => `Line ${result.line}: ${e}`));
  }
  return { valid: errors.length === 0, errors, warnings, lines: lineResults };
}

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

export function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function normalizedScore(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(Number(value))) return 50;
  return Math.max(0, Math.min(100, Number(value)));
}

export function scoreVendor(
  weights: VendorScoreWeights,
  input: VendorScoreInput,
) {
  const factors = {
    price: normalizedScore(input.price),
    delivery: normalizedScore(input.delivery),
    conformity: normalizedScore(input.conformity),
    invoice_accuracy: normalizedScore(input.invoice_accuracy),
    warranty_service: normalizedScore(input.warranty_service),
    compliance: normalizedScore(input.compliance),
    availability: normalizedScore(input.availability),
  };
  const totalWeight = Object.values(weights).reduce(
    (sum, v) => sum + Number(v),
    0,
  );
  if (Math.abs(totalWeight - 100) > 0.001)
    throw new Error('Vendor scoring weights must total 100');
  const weighted = Object.fromEntries(
    Object.entries(factors).map(([key, value]) => [
      key,
      Math.round(
        value * Number(weights[key as keyof VendorScoreWeights]) * 1000,
      ) / 1000,
    ]),
  );
  const finalScore =
    Math.round(
      (Object.values(weighted).reduce((sum, v) => sum + v, 0) / 100) * 1000,
    ) / 1000;
  return {
    factors,
    weighted,
    finalScore,
    confidence:
      input.evidence_count >= 10
        ? ('HIGH' as const)
        : input.evidence_count >= 3
          ? ('MEDIUM' as const)
          : ('LOW' as const),
  };
}
