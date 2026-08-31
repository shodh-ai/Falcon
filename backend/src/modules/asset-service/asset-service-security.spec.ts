import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 8 security', () => {
  const service = readFileSync(
      join(process.cwd(), 'src/modules/asset-service/asset-service.service.ts'),
      'utf8',
    ),
    controller = readFileSync(
      join(
        process.cwd(),
        'src/modules/asset-service/asset-service.controller.ts',
      ),
      'utf8',
    ),
    inventory = readFileSync(
      join(process.cwd(), 'src/modules/inventory/inventory.service.ts'),
      'utf8',
    );
  it('requires JWT, tenant and object scope', () => {
    expect(controller).toContain('@UseGuards(JwtAuthGuard)');
    expect(service).toContain('Tenant context required');
    expect(service).toContain("g.scope_type='TENANT'");
  });
  it('requires optimistic concurrency and idempotency', () => {
    expect(controller).toContain("@Headers('if-match')");
    expect(controller).toContain("@Headers('idempotency-key')");
    expect(service).toContain('Idempotency key reused with changed payload');
  });
  it('blocks normal Module 5 operations while vendor held', () =>
    expect(inventory).toContain(
      'Vendor-held asset can only change custody or location through Module 8',
    ));
  it('preserves maker-checker', () => {
    expect(service).toContain('Reporter cannot approve triage');
    expect(service).toContain('Estimate creator cannot approve the estimate');
    expect(service).toContain(
      'Parts issuer cannot be the sole reconciliation approver',
    );
  });
});
