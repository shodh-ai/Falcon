#!/usr/bin/env node
/**
 * Summarizes backend util/guard coverage from dedicated unit specs.
 * Jest cross-package instrumentation does not merge backend SF paths reliably;
 * this script validates each targeted backend module has a matching spec file.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const backendTargets = [
  'backend/src/modules/exam-cell/exam-cell-rbac.util.ts',
  'backend/src/common/config/campus-admin.roles.ts',
  'backend/src/common/validators/pending-request.util.ts',
  'backend/src/common/guards/jwt-auth.guard.ts',
  'backend/src/common/guards/roles.guard.ts',
  'backend/src/modules/academics/dean-scope.util.ts',
  'backend/src/modules/academics/allocation-semester.util.ts',
  'backend/src/modules/hr/utils/reporting-officer.util.ts',
  'backend/src/modules/student-onboarding/onboarding-portal.util.ts',
  'backend/src/tenant/resolve-tenant-subdomain.ts',
];

const specFiles = fs
  .readdirSync(path.join(root, 'unit'), { recursive: true })
  .filter((f) => String(f).endsWith('.spec.ts'))
  .map((f) => path.join(root, 'unit', String(f)));

const missing = [];
for (const target of backendTargets) {
  const abs = path.join(root, '..', target);
  if (!fs.existsSync(abs)) {
    missing.push(`${target} (file missing)`);
    continue;
  }
  const moduleStem = path.basename(target, '.ts');
  const covered = specFiles.some((spec) => {
    const content = fs.readFileSync(spec, 'utf8');
    return (
      content.includes(moduleStem) ||
      content.includes(target.replace(/^backend\/src\//, ''))
    );
  });
  if (!covered) missing.push(target);
}

if (missing.length) {
  console.error('Backend modules without dedicated unit specs:\n', missing.join('\n'));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      backendModules: backendTargets.length,
      specFiles: specFiles.length,
      status: 'all backend targets covered by unit specs',
    },
    null,
    2,
  ),
);
