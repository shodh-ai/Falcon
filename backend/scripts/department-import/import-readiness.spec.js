const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('node:assert/strict');
const { afterEach, beforeEach, describe, it } = require('node:test');
const { assertImportReadiness } = require('./import-department');

describe('department import readiness gate', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-import-gate-'));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('allows dry-run without a gate', () => {
    assert.doesNotThrow(() =>
      assertImportReadiness({ production_import_gate: 'readiness.json' }, dir, true));
  });

  it('blocks a missing gate', () => {
    assert.throws(
      () => assertImportReadiness({ production_import_gate: 'readiness.json' }, dir, false),
      /readiness gate not found/,
    );
  });

  it('blocks unresolved migration evidence', () => {
    fs.writeFileSync(
      path.join(dir, 'readiness.json'),
      JSON.stringify({
        ready_for_production_import: false,
        blockers: [{ code: 'FACULTY_HR_RECONCILIATION_REQUIRED' }],
      }),
    );
    assert.throws(
      () => assertImportReadiness({ production_import_gate: 'readiness.json' }, dir, false),
      /FACULTY_HR_RECONCILIATION_REQUIRED/,
    );
  });

  it('allows an explicitly ready package', () => {
    fs.writeFileSync(
      path.join(dir, 'readiness.json'),
      JSON.stringify({ ready_for_production_import: true, blockers: [] }),
    );
    assert.doesNotThrow(() =>
      assertImportReadiness({ production_import_gate: 'readiness.json' }, dir, false));
  });
});
