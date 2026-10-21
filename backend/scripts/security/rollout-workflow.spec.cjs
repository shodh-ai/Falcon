'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const workflow = yaml.load(
  fs.readFileSync(
    path.resolve(
      __dirname,
      '../../../.github/workflows/promote-production-images.yml',
    ),
    'utf8',
  ),
);

test('frontend must complete successfully before backend and existing dispatch/environments remain', () => {
  assert.ok(workflow.on.workflow_dispatch.inputs.release_sha.required);
  assert.equal(workflow.on.workflow_dispatch.inputs.deploy.default, false);
  assert.ok(workflow.on.workflow_dispatch.inputs.readiness_evidence.required);
  assert.deepEqual(workflow.jobs['deploy-frontend'].needs, [
    'validate',
    'promote',
  ]);
  assert.deepEqual(workflow.jobs['deploy-backend'].needs, [
    'validate',
    'deploy-frontend',
  ]);
  for (const name of ['promote', 'deploy-frontend', 'deploy-backend'])
    assert.equal(workflow.jobs[name].environment, 'production');
  for (const name of ['deploy-frontend', 'deploy-backend'])
    assert.equal(workflow.jobs[name].if, 'inputs.deploy');
});

test('backend requires fresh exact frontend proof before its webhook; health200 is insufficient', () => {
  const steps = workflow.jobs['deploy-backend'].steps;
  const gate = steps.findIndex(
    (s) =>
      s.run?.includes('release_readiness.py') &&
      s.run.includes('--require-frontend'),
  );
  const webhook = steps.findIndex((s) =>
    s.env?.DEPLOY_WEBHOOK?.includes('COOLIFY_BACKEND_DEPLOY_WEBHOOK'),
  );
  assert.ok(gate >= 0 && webhook > gate);
  assert.equal(
    steps[gate].env.FALCON_ROLLOUT_EVIDENCE,
    '${{ inputs.readiness_evidence }}',
  );
  assert.equal(
    steps[gate].env.FRONTEND_IMAGE_ID,
    '${{ needs.validate.outputs.frontend_image_id }}',
  );
  assert.ok(!steps.slice(0, gate).some((s) => s.run?.includes('curl')));
});

test('access review and operator readiness both gate promotion; no production migrations are added', () => {
  const validate = workflow.jobs.validate.steps;
  assert.ok(
    validate.some((s) => s.run?.includes('access-surface.cjs --enforce')),
  );
  assert.ok(validate.some((s) => s.run?.includes('release_readiness.py')));
  assert.equal(workflow.jobs.promote.needs, 'validate');
  for (const name of ['deploy-frontend', 'deploy-backend']) {
    const steps = workflow.jobs[name].steps;
    const gate = steps.findIndex((s) =>
      s.run?.includes('release_readiness.py'),
    );
    const webhook = steps.findIndex((s) => s.env?.DEPLOY_WEBHOOK);
    assert.ok(gate >= 0 && webhook > gate);
  }
  for (const job of Object.values(workflow.jobs))
    for (const step of job.steps) {
      assert.ok(
        !/db:migrate|deploy-migrate|\bpsql\b|COOLIFY_API_TOKEN/.test(
          step.run || '',
        ),
      );
    }
});
