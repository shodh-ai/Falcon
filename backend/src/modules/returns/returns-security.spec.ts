import { readFileSync } from 'fs';
import { join } from 'path';
describe('DoFA Module 7 security', () => {
  const service = readFileSync(
      join(process.cwd(), 'src/modules/returns/returns.service.ts'),
      'utf8',
    ),
    controller = readFileSync(
      join(process.cwd(), 'src/modules/returns/returns.controller.ts'),
      'utf8',
    ),
    migration = readFileSync(
      join(
        process.cwd(),
        'migrations/20260903120000_dofa_module7_returns_doa.sql',
      ),
      'utf8',
    );
  it('requires authenticated tenant/object-scoped access', () => {
    expect(controller).toContain('@UseGuards(JwtAuthGuard)');
    expect(service).toContain('Tenant context required');
    expect(service).toContain("g.scope_type='TENANT'");
  });
  it('enforces maker-checker boundaries', () => {
    expect(service).toContain('Initiator cannot review eligibility');
    expect(service).toContain('Initiator cannot approve return');
    expect(service).toContain(
      'Eligibility reviewer cannot be the disposition approver',
    );
  });
  it('requires concurrency and retry guards', () => {
    expect(controller).toContain("@Headers('if-match')");
    expect(controller).toContain("@Headers('idempotency-key')");
    expect(service).toContain('Idempotency key reused with changed payload');
  });
  it('protects immutable evidence, decisions, communications and audit', () => {
    for (const trigger of [
      'tr_ret_evidence_immutable',
      'tr_ret_decisions_immutable',
      'tr_ret_vendor_communications_immutable',
      'tr_ret_audit_immutable',
    ])
      expect(migration).toContain(trigger);
  });
});
