import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 9 security contract', () => {
  const service = readFileSync(
      join(__dirname, 'asset-retirement.service.ts'),
      'utf8',
    ),
    evidence = readFileSync(
      join(__dirname, 'asset-retirement-evidence.service.ts'),
      'utf8',
    ),
    legacy = readFileSync(
      join(__dirname, '../uos-governance/uos-governance.service.ts'),
      'utf8',
    );

  it('enforces tenant/object scope inside queries', () => {
    expect(service).toContain('ASSET_RETIREMENT_VIEW');
    expect(service).toContain("g.scope_type='DEPARTMENT'");
    expect(service).toContain('c.tenant_id=$2');
  });

  it('enforces sanitization and handover maker-checker controls', () => {
    expect(service).toContain(
      'Sanitization operator cannot verify the same work',
    );
    expect(service).toContain(
      'Handover executor cannot be the independent witness',
    );
  });

  it('stores tenant-owned, scanned evidence', () => {
    expect(evidence).toContain('asset-retirement/${caseId}');
    expect(evidence).toContain('Malware scanner unavailable');
    expect(evidence).toContain('original_preserved: true');
  });

  it('blocks legacy write-off bypass for Module-5-managed assets', () => {
    expect(legacy).toContain('MODULE9_CANONICAL_RETIREMENT_REQUIRED');
    expect(legacy).toContain('/api/asset-retirement/v1');
  });
});
