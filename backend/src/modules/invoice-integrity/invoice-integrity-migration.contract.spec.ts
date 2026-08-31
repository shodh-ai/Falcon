import { readFileSync } from 'fs';
import { join } from 'path';

const sql = readFileSync(
  join(
    process.cwd(),
    'migrations',
    '20260830120000_dofa_module3_invoice_integrity.sql',
  ),
  'utf8',
);

describe('Module 3 migration contract', () => {
  it.each([
    'inv_integrity_cases',
    'inv_integrity_step_up_challenges',
    'inv_source_accounts',
    'inv_retrieval_attempts',
    'inv_attended_sessions',
    'inv_source_snapshots',
    'inv_evidence',
    'inv_document_analyses',
    'inv_field_comparisons',
    'inv_market_observations',
    'inv_risk_assessments',
    'inv_integrity_blockers',
    'inv_integrity_blocker_resolutions',
    'inv_evidence_requests',
    'inv_investigations',
    'inv_certifications',
    'proc_invoice_integrity_projections',
    'proc_integrity_event_consumption',
    'inv_integrity_audit_events',
    'inv_integrity_outbox_events',
  ])('creates first-class table %s', (table) => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  });

  it('binds cases and decisions to exact invoice evidence', () => {
    expect(sql).toContain('UNIQUE (invoice_id,invoice_revision,document_hash)');
    expect(sql).toContain('evidence_set_hash CHAR(64) NOT NULL');
    expect(sql).toContain('previous_decision_hash CHAR(64)');
    expect(sql).toContain('decision_hash CHAR(64) NOT NULL UNIQUE');
  });

  it('makes evidence, analysis, blockers, certification and audit immutable', () => {
    for (const trigger of [
      'tr_inv_snapshot_immutable',
      'tr_inv_evidence_immutable',
      'tr_inv_analysis_immutable',
      'tr_inv_risk_immutable',
      'tr_inv_blocker_immutable',
      'tr_inv_blocker_resolution_immutable',
      'tr_inv_certification_immutable',
      'tr_inv_audit_immutable',
    ])
      expect(sql).toContain(trigger);
  });

  it('separates shadow analysis from payment-gate rollout', () => {
    expect(sql).toContain("'dofa_module3_invoice_integrity',false");
    expect(sql).toContain("'dofa_module3_payment_gate',false");
  });

  it('stores no browser cookie, password, token or OTP fields', () => {
    const attended = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS inv_attended_sessions'),
      sql.indexOf('CREATE TABLE IF NOT EXISTS inv_source_snapshots'),
    );
    expect(attended).not.toMatch(/cookie|password|access_token|otp/i);
    expect(attended).toContain('profile_destroyed_at');
    expect(attended).toContain('step_up_verified_at');
  });
});
