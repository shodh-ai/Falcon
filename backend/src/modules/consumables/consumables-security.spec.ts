import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module 6 security invariants', () => {
  const service = readFileSync(
    join(process.cwd(), 'src/modules/consumables/consumables.service.ts'),
    'utf8',
  );
  const controller = readFileSync(
    join(process.cwd(), 'src/modules/consumables/consumables.controller.ts'),
    'utf8',
  );
  it('requires authenticated tenant-scoped API access', () => {
    expect(controller).toContain('@UseGuards(JwtAuthGuard)');
    expect(service).toContain('Tenant context required');
    expect(service).toContain('tenant_id=$2');
  });
  it('enforces maker-checker controls', () => {
    expect(service).toContain('Requester cannot approve');
    expect(service).toContain('Issuer cannot review own emergency issue');
    expect(service).toContain('Counter cannot review own count');
  });
  it('requires optimistic concurrency and idempotency', () => {
    expect(controller).toContain("@Headers('if-match')");
    expect(controller).toContain("@Headers('idempotency-key')");
    expect(service).toContain('Idempotency key reused with changed payload');
  });
  it('blocks expired and quarantined stock', () => {
    expect(service).toContain("['AVAILABLE', 'EXPIRING_SOON']");
    expect(service).toContain(
      "e.status IN('EXPIRED','QUARANTINED','DEPLETED')",
    );
  });
});
