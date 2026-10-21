// Test the real archiver runtime, not the CommonJS Jest substitute.
'use strict';
require('reflect-metadata');
const assert = require('node:assert/strict');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { HrDocumentExportService } = require('../dist/modules/hr/hr-document-export.service');

async function main() {
  const taskRoot = mkdtempSync(join(tmpdir(), 'falcon-hr-zip-'));
  const previousRoot = process.env.UPLOAD_PATH;
  process.env.UPLOAD_PATH = taskRoot;
  try {
    mkdirSync(join(taskRoot, 'test-tenant'));
    writeFileSync(join(taskRoot, 'test-tenant', 'document.pdf'), 'test document bytes');
    const service = new HrDocumentExportService(null, null, {
      isEnabled: () => false,
      getBucketName: () => 'falcon-uploads',
    }, null);
    const result = await service.buildZipArchive([
      { document_id: 'available-id', file_url: '/uploads/test-tenant/document.pdf', file_name: null,
        document_type: 'PAN', employee_name: 'Test Person', employee_id: 'EMP1' },
      { document_id: 'missing-id', file_url: '/uploads/test-tenant/missing.pdf', file_name: 'missing.pdf',
        document_type: 'DEGREE', employee_name: 'Test Person', employee_id: 'EMP1' },
    ], 'test-tenant');
    assert.equal(result.packedCount, 1);
    assert.equal(result.skipped.length, 1);
    const archivePath = join(taskRoot, 'result.zip');
    writeFileSync(archivePath, result.zipBuffer);
    execFileSync('unzip', ['-t', archivePath], { stdio: 'pipe' });
    assert.equal(execFileSync('unzip', ['-p', archivePath, 'PAN_TestPerson_EMP1_available-id.bin'], { encoding: 'utf8' }), 'test document bytes');
    const manifest = JSON.parse(execFileSync('unzip', ['-p', archivePath, 'unavailable-documents.json'], { encoding: 'utf8' }));
    assert.equal(manifest.skipped_documents[0].document_id, 'missing-id');
    console.log('PASS: real ZIP integrity, exact source bytes, null filename, missing-file manifest');
  } finally {
    if (previousRoot === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = previousRoot;
    // Only this script-created temporary fixture directory is removed.
    rmSync(taskRoot, { recursive: true, force: true });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
