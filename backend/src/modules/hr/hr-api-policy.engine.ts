import { BadRequestException } from '@nestjs/common';

export type ApiMetric = {
  key: string;
  label: string;
  method: 'COUNT' | 'TARGET' | 'DIRECT';
  unit: string;
  max_points: number;
  points_per_unit: number;
  target: number;
  evidence_required: boolean;
};
export type ApiCategory = {
  key: string;
  label: string;
  weight: number;
  metrics: ApiMetric[];
};
export type ApiSheet = {
  scoring_mode?: 'WEIGHTED_100' | 'RAW_POINTS';
  categories: ApiCategory[];
};
export type ApiInputs = Record<
  string,
  { value: number | null; evidence: string }
>;
const fail = (message: string): never => {
  throw new BadRequestException(message);
};
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export function apiText(v: unknown, name: string, max = 160): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > max)
    return fail(`${name} must contain 1–${max} characters`);
  return v.trim();
}
export function designationKey(v: unknown) {
  return apiText(v, 'Designation', 140).replace(/\s+/g, ' ').toLowerCase();
}
export function apiYear(v: unknown): number {
  if (!Number.isInteger(v) || !finite(v, 2000, 2200))
    return fail('Assessment year must be an integer between 2000 and 2200');
  return v;
}
export function validateApiSheet(raw: unknown): ApiSheet {
  if (
    !object(raw) ||
    !Array.isArray(raw.categories) ||
    raw.categories.length < 1 ||
    raw.categories.length > 10
  )
    return fail('Define 1–10 categories');
  const mode = raw.scoring_mode ?? 'WEIGHTED_100';
  if (mode !== 'WEIGHTED_100' && mode !== 'RAW_POINTS')
    return fail('Choose weighted /100 or raw points scoring');
  const keys = new Set<string>();
  let count = 0;
  const key = (v: unknown) => {
    const value = apiText(v, 'Unique criterion key', 50);
    if (!/^[a-z][a-z0-9_]*$/.test(value) || keys.has(value))
      return fail(
        'Category and metric keys must be unique lowercase identifiers',
      );
    keys.add(value);
    return value;
  };
  const categories = raw.categories.map((c): ApiCategory => {
    if (
      !object(c) ||
      !finite(c.weight, mode === 'RAW_POINTS' ? 0 : 0.01, 100) ||
      !Array.isArray(c.metrics) ||
      !c.metrics.length
    )
      return fail(
        'Each category needs metrics and a valid weight (positive in weighted mode)',
      );
    const categoryKey = key(c.key);
    const metrics = c.metrics.map((m): ApiMetric => {
      if (
        !object(m) ||
        typeof m.method !== 'string' ||
        !['COUNT', 'TARGET', 'DIRECT'].includes(m.method) ||
        !finite(m.max_points, 0.01, 10000) ||
        typeof m.evidence_required !== 'boolean'
      )
        return fail('Invalid metric method, cap or evidence setting');
      if (++count > 40) return fail('A sheet can contain at most 40 metrics');
      if (m.method === 'COUNT' && !finite(m.points_per_unit, 0.01, 10000))
        return fail('Count metrics need positive points per item');
      if (m.method === 'TARGET' && !finite(m.target, 0.01, 1000000))
        return fail('Target metrics need a positive target');
      return {
        key: key(m.key),
        label: apiText(m.label, 'Metric label'),
        method: m.method as ApiMetric['method'],
        unit: apiText(m.unit, 'Unit', 50),
        max_points: m.max_points,
        points_per_unit:
          m.method === 'COUNT' ? (m.points_per_unit as number) : 1,
        target: m.method === 'TARGET' ? (m.target as number) : 1,
        evidence_required: m.evidence_required,
      };
    });
    return {
      key: categoryKey,
      label: apiText(c.label, 'Category label'),
      weight: c.weight,
      metrics,
    };
  });
  if (
    mode === 'WEIGHTED_100' &&
    Math.abs(categories.reduce((sum, c) => sum + c.weight, 0) - 100) > 0.000001
  )
    return fail('Category weights must total exactly 100%');
  return { scoring_mode: mode, categories };
}

const round = (n: number, places = 4) => Number(n.toFixed(places));
export function calculateApiSheet(sheetRaw: unknown, inputRaw: unknown) {
  const sheet = validateApiSheet(sheetRaw);
  if (!object(inputRaw))
    return fail('Provide criterion values keyed by metric');
  const known = new Set(
    sheet.categories.flatMap((c) => c.metrics.map((m) => m.key)),
  );
  if (Object.keys(inputRaw).some((key) => !known.has(key)))
    return fail('Inputs contain an unknown criterion');
  const issues: string[] = [];
  const inputs: ApiInputs = {};
  const categories = sheet.categories.map((c) => {
    const metrics = c.metrics.map((m) => {
      const data = Object.hasOwn(inputRaw, m.key) ? inputRaw[m.key] : undefined;
      if (data !== undefined && !object(data))
        return fail(`Invalid input for ${m.label}`);
      const entry = data as Record<string, unknown> | undefined;
      const value = entry?.value ?? null;
      if (
        value !== null &&
        (!finite(value, 0, 1000000) ||
          (m.method === 'COUNT' && !Number.isInteger(value)))
      )
        return fail(
          `${m.label}: enter a finite, non-negative ${m.method === 'COUNT' ? 'whole number' : 'number'}`,
        );
      if (
        m.method === 'DIRECT' &&
        value !== null &&
        (value as number) > m.max_points
      )
        return fail(`${m.label}: direct score cannot exceed ${m.max_points}`);
      if (
        entry?.evidence !== undefined &&
        (typeof entry.evidence !== 'string' || entry.evidence.length > 1000)
      )
        return fail(
          `${m.label}: evidence reference must be text of at most 1000 characters`,
        );
      const evidence =
        typeof entry?.evidence === 'string' ? entry.evidence.trim() : '';
      if (value === null) issues.push(`${m.label}: value is missing`);
      if (
        m.evidence_required &&
        typeof value === 'number' &&
        value > 0 &&
        !evidence
      )
        issues.push(`${m.label}: evidence reference is missing`);
      inputs[m.key] = { value: value as number | null, evidence };
      const raw =
        value === null
          ? 0
          : m.method === 'COUNT'
            ? (value as number) * m.points_per_unit
            : m.method === 'TARGET'
              ? ((value as number) / m.target) * m.max_points
              : (value as number);
      const earned = Math.min(raw, m.max_points);
      return {
        ...m,
        value,
        evidence,
        raw_points: round(raw),
        earned_points: round(earned),
        formula:
          m.method === 'COUNT'
            ? `min(value × ${m.points_per_unit}, ${m.max_points})`
            : m.method === 'TARGET'
              ? `min(value ÷ ${m.target} × ${m.max_points}, ${m.max_points})`
              : `value (0–${m.max_points})`,
      };
    });
    const max = c.metrics.reduce((sum, m) => sum + m.max_points, 0);
    const earned = metrics.reduce((sum, m) => sum + m.earned_points, 0);
    return {
      key: c.key,
      label: c.label,
      weight: c.weight,
      max_points: max,
      earned_points: round(earned),
      weighted_points: round(
        sheet.scoring_mode === 'RAW_POINTS'
          ? earned
          : (earned / max) * c.weight,
      ),
      formula:
        sheet.scoring_mode === 'RAW_POINTS'
          ? 'Sum of capped criterion points'
          : `earned ÷ ${max} × ${c.weight}`,
      metrics,
    };
  });
  return {
    total: round(
      categories.reduce((sum, c) => sum + c.weighted_points, 0),
      2,
    ),
    maximum:
      sheet.scoring_mode === 'RAW_POINTS'
        ? categories.reduce((sum, c) => sum + c.max_points, 0)
        : 100,
    complete: issues.length === 0,
    issues,
    categories,
    inputs,
    disclaimer:
      'Calculation only. Evidence references are not verified automatically. This is not an appraisal approval or promotion eligibility decision.',
  };
}

export const API_TEMPLATE_REFERENCE =
  'https://www.ugc.gov.in/e-book/UGC_Regulation/files/basic-html/page791.html';
export function apiStarterTemplate() {
  const metric = (
    key: string,
    label: string,
    method: ApiMetric['method'],
    max_points: number,
    target: number,
    unit: string,
  ): ApiMetric => ({
    key,
    label,
    method,
    max_points,
    target,
    points_per_unit: 5,
    unit,
    evidence_required: true,
  });
  return {
    label: 'Illustrative balanced faculty sheet - HR review required',
    notice:
      'Sample annual internal appraisal only. Weights, targets and points are illustrative, not UGC/CAS/PCI compliance or promotion rules. Adapt by designation and obtain institutional approval before publishing.',
    reference_url: API_TEMPLATE_REFERENCE,
    sheet: {
      categories: [
        {
          key: 'teaching',
          label: 'Teaching and learning',
          weight: 40,
          metrics: [
            metric(
              'teaching_delivery',
              'Assigned teaching delivered',
              'TARGET',
              60,
              100,
              'percent',
            ),
            metric(
              'teaching_materials',
              'Reviewed learning resources',
              'COUNT',
              40,
              1,
              'resources',
            ),
          ],
        },
        {
          key: 'research',
          label: 'Research and academic contribution',
          weight: 30,
          metrics: [
            metric(
              'research_outputs',
              'Evidence-backed research outputs',
              'COUNT',
              60,
              1,
              'outputs',
            ),
            metric(
              'research_projects',
              'Reviewed projects / supervision',
              'DIRECT',
              40,
              1,
              'review points',
            ),
          ],
        },
        {
          key: 'development',
          label: 'Professional development',
          weight: 15,
          metrics: [
            metric(
              'development_hours',
              'Verified professional development',
              'TARGET',
              100,
              30,
              'hours',
            ),
          ],
        },
        {
          key: 'service',
          label: 'Institutional service and extension',
          weight: 15,
          metrics: [
            metric(
              'service_contribution',
              'Reviewed service contribution',
              'DIRECT',
              100,
              1,
              'review points',
            ),
          ],
        },
      ],
    } satisfies ApiSheet,
  };
}
