import {
  calculateAcquisition,
  assertSafeAcquisitionInput,
  scoreVendor,
  sha256,
  stableJson,
  toDateOnlyString,
  validateAcquisition,
} from './acquisition.util';
import type { CreateAcquisitionInput } from './acquisition.types';

const request: CreateAcquisitionInput = {
  intended_use_case: 'Robotics lab refresh',
  required_by_date: '2099-01-01',
  priority: 'HIGH',
  funding_source_type: 'DEPARTMENT',
  funding_source_id: '00000000-0000-4000-8000-000000000001',
  lines: [
    {
      acquisition_layout: 'ONLINE',
      product_name: 'Controller',
      category: 'Electronics',
      quantity: 2,
      intended_use: 'Robot control',
      estimated_unit_price: 1000.1,
      delivery_cost: 100,
      tax_cost: 360.04,
      product_url: 'https://example.com/controller',
      item_classification: 'ASSET',
    },
  ],
};

describe('acquisition utilities', () => {
  it('calculates server-side fixed precision totals', () => {
    expect(calculateAcquisition(request.lines)).toEqual({
      product: 2000.2,
      delivery: 100,
      tax: 360.04,
      installation: 0,
      service: 0,
      miscellaneous: 0,
      total: 2460.24,
    });
  });

  it('uses integer minor units for fractional quantities and floating point traps', () => {
    const lines = [
      {
        ...request.lines[0],
        quantity: 0.3,
        estimated_unit_price: 0.1,
        delivery_cost: 0.1,
        tax_cost: 0.2,
      },
      {
        ...request.lines[0],
        quantity: 1,
        estimated_unit_price: 0.1,
        delivery_cost: 0.2,
        tax_cost: 0,
      },
    ];
    expect(calculateAcquisition(lines).total).toBe(0.63);
  });

  it('validates online requirements and required-by date', () => {
    expect(validateAcquisition(request).valid).toBe(true);
    const invalid = structuredClone(request);
    invalid.lines[0].product_url = 'http://example.com';
    expect(validateAcquisition(invalid).errors).toContain(
      'Line 1: product_url must use HTTPS',
    );
  });

  it('normalizes PostgreSQL Date values before acquisition validation', () => {
    expect(toDateOnlyString(new Date('2099-01-01T00:00:00.000Z'))).toBe(
      '2099-01-01',
    );
    expect(toDateOnlyString('2099-01-01T00:00:00.000Z')).toBe('2099-01-01');
  });

  it('hashes Date values exactly as their stored JSON representation', () => {
    const payload = {
      required_by_date: new Date('2026-10-02T00:00:00.000Z'),
      nested: { reserved_at: new Date('2026-09-02T11:08:12.352Z') },
    };
    expect(sha256(payload)).toBe(sha256(JSON.parse(JSON.stringify(payload))));
  });

  it('rejects oversized text and invalid currency before persistence', () => {
    expect(() =>
      assertSafeAcquisitionInput({ ...request, currency: 'RUPEES' }),
    ).toThrow('currency');
    expect(() =>
      assertSafeAcquisitionInput({
        ...request,
        lines: [
          {
            ...request.lines[0],
            product_url: `https://example.com/${'x'.repeat(2100)}`,
          },
        ],
      }),
    ).toThrow('product_url');
  });

  it('produces deterministic canonical hashes', () => {
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
    expect(sha256({ b: 2, a: 1 })).toBe(sha256({ a: 1, b: 2 }));
    expect(JSON.parse(stableJson({ a: 1, optional: undefined }))).toEqual({
      a: 1,
    });
  });

  it('scores vendors reproducibly and marks sparse evidence low confidence', () => {
    const result = scoreVendor(
      {
        price: 25,
        delivery: 20,
        conformity: 20,
        invoice_accuracy: 10,
        warranty_service: 10,
        compliance: 10,
        availability: 5,
      },
      {
        price: 80,
        delivery: 90,
        conformity: 100,
        invoice_accuracy: 100,
        warranty_service: 70,
        compliance: 100,
        availability: 60,
        evidence_count: 2,
      },
    );
    expect(result.finalScore).toBe(88);
    expect(result.confidence).toBe('LOW');
  });
});
