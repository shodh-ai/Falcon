import {
  apiStarterTemplate,
  apiYear,
  calculateApiSheet,
  designationKey,
  validateApiSheet,
} from './hr-api-policy.engine';
import { apiRevision, apiUuid } from './hr-api-policy.service';
describe('Designation API calculation engine', () => {
  const sheet = () => structuredClone(apiStarterTemplate().sheet);
  const full = () =>
    Object.fromEntries(
      sheet().categories.flatMap((c) =>
        c.metrics.map((m) => [
          m.key,
          {
            value:
              m.method === 'TARGET'
                ? m.target
                : m.method === 'DIRECT'
                  ? m.max_points
                  : Math.ceil(m.max_points / m.points_per_unit),
            evidence: 'Inspected evidence reference',
          },
        ]),
      ),
    );
  it('provides an explicitly illustrative template without regulatory eligibility claims', () => {
    expect(apiStarterTemplate().notice).toContain('illustrative');
    expect(calculateApiSheet(sheet(), full()).total).toBe(100);
    expect(calculateApiSheet(sheet(), full()).disclaimer).toContain(
      'not an appraisal approval',
    );
  });
  it('shows the raw score, cap and weighted arithmetic for every metric', () => {
    const inputs = full();
    inputs.research_outputs.value = 100;
    const result = calculateApiSheet(sheet(), inputs);
    const metric = result.categories[1].metrics[0];
    expect(metric.raw_points).toBe(500);
    expect(metric.earned_points).toBe(60);
    expect(result.categories[1].weighted_points).toBe(30);
    expect(result.total).toBe(100);
  });
  it('requires explicit zeroes, but not evidence for zero claims', () => {
    const inputs = Object.fromEntries(
      Object.keys(full()).map((key) => [key, { value: 0, evidence: '' }]),
    );
    expect(calculateApiSheet(sheet(), inputs)).toMatchObject({
      total: 0,
      complete: true,
    });
    expect(calculateApiSheet(sheet(), {}).complete).toBe(false);
  });
  it('does not silently count unreferenced positive claims as a complete calculation', () => {
    const inputs = full();
    inputs.research_outputs.evidence = '';
    expect(calculateApiSheet(sheet(), inputs).issues).toContain(
      'Evidence-backed research outputs: evidence reference is missing',
    );
  });
  it.each([-1, NaN, Infinity, 1.5, '5', true])(
    'rejects invalid count input %p',
    (value) => {
      expect(() =>
        calculateApiSheet(sheet(), {
          ...full(),
          research_outputs: { value, evidence: 'Reference' },
        }),
      ).toThrow();
    },
  );
  it('supports raw API points without imposing a 100-point normalized ceiling', () => {
    const raw = {
      ...sheet(),
      scoring_mode: 'RAW_POINTS',
      categories: sheet().categories.map((c) => ({ ...c, weight: 0 })),
    };
    const result = calculateApiSheet(raw, full());
    expect(result.total).toBe(400);
    expect(result.maximum).toBe(400);
    expect(result.categories[0].formula).toContain('Sum of capped');
  });
  it('supports fractional target progress with an explicit explanation', () => {
    const inputs = full();
    inputs.development_hours.value = 7.5;
    const result = calculateApiSheet(sheet(), inputs);
    expect(result.categories[2].weighted_points).toBe(3.75);
    expect(result.total).toBe(88.75);
  });
  it('rejects direct scores beyond the cap instead of masking an invalid rating', () => {
    expect(() =>
      calculateApiSheet(sheet(), {
        ...full(),
        research_projects: { value: 41, evidence: 'Reference' },
      }),
    ).toThrow('cannot exceed');
  });
  it('rejects unknown metrics rather than silently ignoring them', () => {
    expect(() =>
      calculateApiSheet(sheet(), { ...full(), injected: { value: 100 } }),
    ).toThrow('unknown criterion');
  });
  it('refuses non-100 weights, duplicate keys and executable formula strings', () => {
    const a = sheet();
    a.categories[0].weight = 99;
    expect(() => validateApiSheet(a)).toThrow('100%');
    const b = sheet();
    b.categories[1].metrics[0].key = b.categories[0].metrics[0].key;
    expect(() => validateApiSheet(b)).toThrow('unique');
    const c = sheet();
    (c.categories[0].metrics[0] as { method: string }).method = 'eval';
    expect(() => validateApiSheet(c)).toThrow('method');
  });
  it.each([0, -1, NaN, Infinity])(
    'refuses invalid targets and caps %p',
    (value) => {
      const a = sheet();
      a.categories[0].metrics[0].target = value;
      expect(() => validateApiSheet(a)).toThrow('target');
      const b = sheet();
      b.categories[0].metrics[0].max_points = value;
      expect(() => validateApiSheet(b)).toThrow('cap');
    },
  );
  it('normalizes spacing/case without treating login roles as designations', () => {
    expect(designationKey(' Assistant   Professor ')).toBe(
      'assistant professor',
    );
    expect(designationKey('Associate Professor')).not.toBe(
      designationKey('Assistant Professor'),
    );
  });
  it.each(['', 'W/"1"', '"1', '1"', '0', '-1', '1.5'])(
    'requires a valid If-Match revision %s',
    (v) => expect(() => apiRevision(v)).toThrow(),
  );
  it('checks request identifiers and years before querying', () => {
    expect(apiRevision('"2"')).toBe(2);
    expect(() => apiUuid('../other')).toThrow();
    expect(() => apiYear('2026')).toThrow();
    expect(() => apiYear(2026.5)).toThrow();
  });
});
