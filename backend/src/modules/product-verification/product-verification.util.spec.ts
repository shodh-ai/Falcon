import {
  calculateCoverageConfidence,
  compareAttribute,
  evaluateGeofence,
  verificationHash,
  signVerificationPayload,
  verifyVerificationPayload,
} from './product-verification.util';
import { generateKeyPairSync } from 'crypto';

describe('product verification deterministic controls', () => {
  const policy = [
    {
      attribute_name: 'model',
      weight: 60,
      required: true,
      hard_identifier: true,
      comparison_method: 'NORMALIZED_EXACT',
      ai_mode: 'DISABLED' as const,
    },
    {
      attribute_name: 'colour',
      weight: 40,
      required: true,
      hard_identifier: false,
      comparison_method: 'NORMALIZED_EXACT',
      ai_mode: 'OPTIONAL' as const,
    },
  ];

  it('makes UNKNOWN reduce coverage without treating it as a mismatch', () => {
    expect(
      calculateCoverageConfidence(policy, [
        {
          attribute_name: 'model',
          outcome: 'MATCHED',
          extraction_confidence: 90,
        },
        { attribute_name: 'colour', outcome: 'UNKNOWN' },
      ]),
    ).toEqual({ coverage_score: 60, confidence_score: 90 });
  });

  it('counts mismatches as observed and preserves deterministic comparison', () => {
    expect(
      compareAttribute(policy[0], 'Latitude 5450', {
        attribute_name: 'model',
        value: ' latitude 5450 ',
        extraction_confidence: 99,
      }),
    ).toBe('MATCHED');
    expect(
      compareAttribute(policy[0], 'Latitude 5450', {
        attribute_name: 'model',
        value: 'Latitude 5440',
        extraction_confidence: 99,
      }),
    ).toBe('MISMATCHED');
  });

  it('evaluates accuracy and circle boundaries', () => {
    const circle = { latitude: 26.9, longitude: 75.8, radius_metres: 100 };
    expect(
      evaluateGeofence(
        'CIRCLE',
        circle,
        { latitude: 26.9, longitude: 75.8, accuracy_metres: 10 },
        50,
      ),
    ).toBe('SATISFIED');
    expect(
      evaluateGeofence(
        'CIRCLE',
        circle,
        { latitude: 26.9, longitude: 75.8, accuracy_metres: 75 },
        50,
      ),
    ).toBe('LOW_ACCURACY');
  });

  it('uses canonical object hashing', () => {
    expect(verificationHash({ b: 2, a: 1 })).toBe(
      verificationHash({ a: 1, b: 2 }),
    );
  });

  it('issues deterministic Ed25519 payload signatures that reject mutation', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const payload = { subject_id: 'subject-1', status: 'ACTIVE', revision: 2 };
    const signature = signVerificationPayload(payload, privateKey);
    expect(verifyVerificationPayload(payload, signature, publicKey)).toBe(true);
    expect(
      verifyVerificationPayload(
        { ...payload, status: 'REVOKED' },
        signature,
        publicKey,
      ),
    ).toBe(false);
  });
});
