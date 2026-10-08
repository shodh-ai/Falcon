import { createHash, sign, verify } from 'crypto';
import type {
  AttributeOutcome,
  ObservedAttribute,
  PolicyAttribute,
} from './product-verification.types';

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

export function verificationHash(value: unknown): string {
  const payload = Buffer.isBuffer(value)
    ? value
    : Buffer.from(stableJson(value));
  return createHash('sha256').update(payload).digest('hex');
}

export function signVerificationPayload(
  payload: unknown,
  privateKey: string,
): string {
  return sign(null, Buffer.from(stableJson(payload)), privateKey).toString(
    'base64url',
  );
}

export function verifyVerificationPayload(
  payload: unknown,
  signature: string,
  publicKey: string,
): boolean {
  return verify(
    null,
    Buffer.from(stableJson(payload)),
    publicKey,
    Buffer.from(signature, 'base64url'),
  );
}

export function calculateCoverageConfidence(
  policy: PolicyAttribute[],
  observations: ObservedAttribute[],
) {
  const byName = new Map(
    observations.map((item) => [item.attribute_name, item]),
  );
  const required = policy.filter((attribute) => attribute.required);
  const applicable = required.filter(
    (attribute) =>
      byName.get(attribute.attribute_name)?.outcome !== 'NOT_APPLICABLE',
  );
  const denominator = applicable.reduce(
    (sum, attribute) => sum + Number(attribute.weight),
    0,
  );
  const observed = applicable.filter((attribute) => {
    const outcome = byName.get(attribute.attribute_name)?.outcome;
    return outcome === 'MATCHED' || outcome === 'MISMATCHED';
  });
  const observedWeight = observed.reduce(
    (sum, attribute) => sum + Number(attribute.weight),
    0,
  );
  const coverage = denominator ? (observedWeight / denominator) * 100 : 100;
  const confidence = observedWeight
    ? observed.reduce((sum, attribute) => {
        const score = Number(
          byName.get(attribute.attribute_name)?.extraction_confidence ?? 0,
        );
        return (
          sum + Number(attribute.weight) * Math.max(0, Math.min(100, score))
        );
      }, 0) / observedWeight
    : 0;
  return {
    coverage_score: Number(coverage.toFixed(2)),
    confidence_score: Number(confidence.toFixed(2)),
  };
}

function normalized(value: unknown) {
  if (typeof value === 'string') return value.trim().toLocaleLowerCase();
  if (typeof value === 'number') return value;
  return stableJson(value);
}

export function compareAttribute(
  policy: PolicyAttribute,
  expected: unknown,
  observed: ObservedAttribute | undefined,
): AttributeOutcome {
  if (observed?.outcome === 'NOT_APPLICABLE') return 'NOT_APPLICABLE';
  if (
    !observed ||
    observed.value === undefined ||
    observed.value === null ||
    observed.value === ''
  )
    return 'UNKNOWN';
  if (observed.outcome === 'MISMATCHED') return 'MISMATCHED';
  if (policy.comparison_method === 'PRESENT_UNIQUE') return 'MATCHED';
  if (expected === undefined || expected === null || expected === '')
    return 'UNKNOWN';
  if (policy.comparison_method === 'NUMERIC_EXACT')
    return Math.abs(Number(expected) - Number(observed.value)) <= 0.0005
      ? 'MATCHED'
      : 'MISMATCHED';
  return normalized(expected) === normalized(observed.value)
    ? 'MATCHED'
    : 'MISMATCHED';
}

export function pointInPolygon(
  latitude: number,
  longitude: number,
  points: Array<{ latitude: number; longitude: number }>,
) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].longitude;
    const yi = points[i].latitude;
    const xj = points[j].longitude;
    const yj = points[j].latitude;
    const intersects =
      yi > latitude !== yj > latitude &&
      longitude <
        ((xj - xi) * (latitude - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function distanceMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const radius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitude1 = toRadians(a.latitude);
  const latitude2 = toRadians(b.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;
  return (
    2 * radius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

export function evaluateGeofence(
  geometryType: 'CIRCLE' | 'POLYGON',
  geometry: Record<string, unknown>,
  location: { latitude?: number; longitude?: number; accuracy_metres?: number },
  maximumAccuracy: number,
) {
  if (
    !Number.isFinite(location.latitude) ||
    !Number.isFinite(location.longitude) ||
    !Number.isFinite(location.accuracy_metres)
  )
    return 'MISSING' as const;
  if (Number(location.accuracy_metres) > maximumAccuracy)
    return 'LOW_ACCURACY' as const;
  const point = {
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
  const inside =
    geometryType === 'CIRCLE'
      ? distanceMetres(point, {
          latitude: Number(geometry.latitude),
          longitude: Number(geometry.longitude),
        }) <= Number(geometry.radius_metres)
      : pointInPolygon(
          point.latitude,
          point.longitude,
          Array.isArray(geometry.points)
            ? (geometry.points as Array<{
                latitude: number;
                longitude: number;
              }>)
            : [],
        );
  return inside ? ('SATISFIED' as const) : ('OUTSIDE' as const);
}
