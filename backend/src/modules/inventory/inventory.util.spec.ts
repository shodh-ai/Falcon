import { generateKeyPairSync } from 'crypto';
import {
  canonicalJson,
  inventoryHash,
  normalizedSerial,
  renderIdentifier,
  signInventoryIdentity,
  verifyInventoryIdentity,
} from './inventory.util';

describe('Module 5 inventory primitives', () => {
  it('hashes canonical payloads reproducibly', () => {
    expect(canonicalJson({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(inventoryHash({ b: 2, a: 1 })).toBe(inventoryHash({ a: 1, b: 2 }));
  });
  it('normalizes manufacturer serials without generating them', () => {
    expect(normalizedSerial(' rp54-8f:29 ')).toBe('RP548F29');
    expect(normalizedSerial()).toBeNull();
  });
  it('renders tenant-scoped sequential identities', () => {
    expect(
      renderIdentifier(
        'AST-{tenant}-{yyyy}-{seq6}',
        'falcon',
        7,
        new Date('2026-08-27T00:00:00Z'),
      ),
    ).toBe('AST-FALCON-2026-000007');
  });
  it('signs Ed25519 identities and rejects mutation', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const payload = { inventory_record_id: 'record-1', identity_revision: 1 };
    const signature = signInventoryIdentity(payload, privateKey);
    expect(verifyInventoryIdentity(payload, signature, publicKey)).toBe(true);
    expect(
      verifyInventoryIdentity(
        { ...payload, identity_revision: 2 },
        signature,
        publicKey,
      ),
    ).toBe(false);
  });
});
