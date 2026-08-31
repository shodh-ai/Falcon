import { readFileSync } from 'fs';
import { join } from 'path';

describe('DoFA Module X migration controls', () => {
  const migration = readFileSync(
    join(
      __dirname,
      '../../../migrations/20260906120000_dofa_module_x_physical_identity.sql',
    ),
    'utf8',
  );

  it('creates trusted jobs, devices, observations and projections', () => {
    for (const table of [
      'pix_provisioning_jobs',
      'pix_devices',
      'pix_attachment_verifications',
      'pix_movement_permits',
      'pix_gate_observations',
      'pix_inventory_projections',
      'pix_outbox_events',
    ])
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
  });

  it('enforces identity authority, immutable evidence and unique active tags', () => {
    expect(migration).toContain('MODULE_X_IDENTITY_MUST_BE_MODULE5_AUTHORIZED');
    expect(migration).toContain('MODULE_X_AUTHORIZATION_IMMUTABLE');
    expect(migration).toContain('pix_append_only');
    expect(migration).toContain('uq_pix_physical_tag_once');
    expect(migration).toContain('UNIQUE(certificate_fingerprint)');
  });

  it('defaults every production gate off', () => {
    for (const flag of [
      'dofa_module_x_physical_identity',
      'dofa_module_x_provisioning_gate',
      'dofa_module_x_gate_observation',
      'dofa_module_x_retrofit',
    ])
      expect(migration).toContain(`'${flag}',false`);
  });
});
