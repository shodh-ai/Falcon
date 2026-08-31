import { generateKeyPairSync } from 'crypto';
import {
  physicalIdentityHash,
  signPhysicalIdentity,
  verifyPhysicalIdentity,
} from './physical-identity.util';

describe('Module X cryptographic contracts', () => {
  it('canonicalizes hashes regardless of object key order', () => {
    expect(physicalIdentityHash({ b: 2, a: 1 })).toBe(
      physicalIdentityHash({ a: 1, b: 2 }),
    );
  });

  it('rejects a changed signed provisioning payload', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const payload = { inventory_record_id: 'inventory-1', revision: 4 };
    const signature = signPhysicalIdentity(
      payload,
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    );
    const publicPem = publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    expect(verifyPhysicalIdentity(payload, signature, publicPem)).toBe(true);
    expect(
      verifyPhysicalIdentity({ ...payload, revision: 5 }, signature, publicPem),
    ).toBe(false);
  });
});
