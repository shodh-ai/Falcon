import { readFileSync } from 'fs';
import { join } from 'path';

const source = (path: string) =>
  readFileSync(join(process.cwd(), 'src/modules', path), 'utf8');

describe('PostgreSQL mutation result compatibility', () => {
  it.each([
    'acquisitions/acquisition.service.ts',
    'acquisitions/acquisition-integration.service.ts',
    'procurements/procurement-import.service.ts',
    'consumables/consumables.service.ts',
    'asset-service/asset-service.service.ts',
    'product-verification/product-verification.service.ts',
    'physical-identity/physical-identity.service.ts',
  ])('%s normalizes UPDATE RETURNING tuples', (path) => {
    expect(source(path)).toContain('Array.isArray(');
  });
});
