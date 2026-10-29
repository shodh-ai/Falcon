'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const templatePath = path.join(__dirname, '../workflow-templates/publish-staging-images.yml');
const workflow = fs.readFileSync(templatePath, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// Execute only the reviewed inline validation with synthetic API mocks. No
// application, workflow, build, registry, database or network operation runs.
function script(name) {
  const start = workflow.indexOf(`// BEGIN ${name}`);
  const end = workflow.indexOf(`// END ${name}`);
  assert(start >= 0 && end > start, `Missing inline policy: ${name}`);
  return new AsyncFunction('github', 'context', 'core', 'process', workflow.slice(start, end));
}
const validateSource = script('SOURCE VALIDATION');
const revalidatePublication = script('PUBLICATION REVALIDATION');
const validateConfig = script('CONFIG VALIDATION');
const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const repository = { full_name: 'shodh-ai/Falcon' };

function fixture({ automatic = false } = {}) {
  const state = {
    head: sha, secondHead: null, refReads: 0,
    runs: [{ id: 100, workflow_id: 12, run_attempt: 1, status: 'completed', conclusion: 'success',
      event: 'push', head_branch: 'staging', head_sha: sha, head_repository: repository }],
  };
  const context = { repo: { owner: 'shodh-ai', repo: 'Falcon' }, ref: 'refs/heads/main', runId: 200,
    eventName: automatic ? 'workflow_run' : 'workflow_dispatch', payload: {} };
  if (automatic) context.payload.workflow_run = structuredClone(state.runs[0]);
  const env = { STAGING_IMAGES_ENABLED: 'true', SOURCE_SHA: sha, GITHUB_RUN_ATTEMPT: '2' };
  const outputs = {};
  const github = {
    rest: {
      actions: { getWorkflow: async args => {
        assert.equal(args.workflow_id, 'falcon-tests.yml');
        return { data: { id: 12 } };
      }, listWorkflowRuns: 'runs' },
      git: { getRef: async args => {
        assert.equal(args.ref, 'heads/staging');
        state.refReads++;
        return { data: { object: { type: 'commit', sha: state.refReads > 1 ? state.secondHead || state.head : state.head } } };
      } },
    },
    paginate: async (method, args) => {
      assert.equal(method, 'runs');
      assert.equal(args.owner, 'shodh-ai'); assert.equal(args.repo, 'Falcon');
      assert.equal(args.workflow_id, 12); assert.equal(args.branch, 'staging'); assert.equal(args.head_sha, sha);
      return state.runs;
    },
  };
  return { state, context, env, outputs, github,
    run: () => validateSource(github, context, { setOutput: (key, value) => { outputs[key] = value; } }, { env }),
    revalidate: () => revalidatePublication(github, context, {}, { env: { ...env,
      EXPECTED_CI_RUN_ID: outputs.ci_run_id, EXPECTED_CI_RUN_ATTEMPT: outputs.ci_run_attempt } }) };
}

for (const automatic of [false, true]) {
  const mode = automatic ? 'automatic' : 'manual';
  test(`${mode} publication accepts only the current staging head with latest successful push CI`, async () => {
    const f = fixture({ automatic });
    await f.run();
    assert.equal(f.state.refReads, 2);
    assert.deepEqual(f.outputs, { source_sha: sha, ci_run_id: '100', ci_run_attempt: '1', image_tag: `sha-${sha}-run-200-2` });
  });

  test(`${mode} publication refuses disabled, untrusted, malformed and moved-head requests`, async t => {
    const cases = [
      ['switch absent', f => { delete f.env.STAGING_IMAGES_ENABLED; }],
      ['switch false', f => { f.env.STAGING_IMAGES_ENABLED = 'false'; }],
      ['switch non-exact', f => { f.env.STAGING_IMAGES_ENABLED = 'TRUE'; }],
      ['fork', f => { f.context.repo.owner = 'someone'; }],
      ['testing repository', f => { f.context.repo.repo = 'Falcon-testing'; }],
      ['staging workflow ref', f => { f.context.ref = 'refs/heads/staging'; }],
      ['feature workflow ref', f => { f.context.ref = 'refs/heads/feature/test'; }],
      ['tag workflow ref', f => { f.context.ref = 'refs/tags/main'; }],
      ['untrusted event', f => { f.context.eventName = 'pull_request_target'; }],
      ['malformed SHA', f => { if (automatic) f.context.payload.workflow_run.head_sha = 'aaaaaaa'; else f.env.SOURCE_SHA = 'aaaaaaa'; }],
      ['moved staging head', f => { f.state.head = otherSha; }],
      ['head moves during validation', f => { f.state.secondHead = otherSha; }],
      ['missing run attempt', f => { delete f.env.GITHUB_RUN_ATTEMPT; }],
      ['API unavailable', f => { f.github.paginate = async () => { throw new Error('synthetic API unavailable'); }; }],
    ];
    for (const [name, mutate] of cases) await t.test(name, async () => {
      const f = fixture({ automatic }); mutate(f); await assert.rejects(f.run()); assert.deepEqual(f.outputs, {});
    });
  });

  test(`${mode} publication refuses missing, foreign, failed or superseded CI`, async t => {
    const cases = [
      ['no CI', f => { f.state.runs = []; }],
      ['wrong source SHA', f => { f.state.runs[0].head_sha = otherSha; }],
      ['wrong branch', f => { f.state.runs[0].head_branch = 'main'; }],
      ['PR CI', f => { f.state.runs[0].event = 'pull_request'; }],
      ['fork CI', f => { f.state.runs[0].head_repository = { full_name: 'someone/Falcon' }; }],
      ['wrong workflow ID', f => { f.state.runs[0].workflow_id = 99; }],
      ['failed CI', f => { f.state.runs[0].conclusion = 'failure'; }],
      ['skipped CI', f => { f.state.runs[0].conclusion = 'skipped'; }],
      ['newer failed run', f => { f.state.runs.push({ ...f.state.runs[0], id: 101, conclusion: 'failure' }); }],
      ['pending rerun', f => { f.state.runs.push({ ...f.state.runs[0], run_attempt: 2, status: 'in_progress', conclusion: null }); }],
    ];
    for (const [name, mutate] of cases) await t.test(name, async () => {
      const f = fixture({ automatic }); mutate(f); await assert.rejects(f.run()); assert.deepEqual(f.outputs, {});
    });
  });
}

test('automatic trigger itself must be matching successful staging CI and the latest attempt', async t => {
  const cases = [
    ['wrong branch', run => { run.head_branch = 'feature/test'; }],
    ['wrong event', run => { run.event = 'pull_request'; }],
    ['wrong repository', run => { run.head_repository = { full_name: 'someone/Falcon' }; }],
    ['wrong workflow', run => { run.workflow_id = 99; }],
    ['failed trigger', run => { run.conclusion = 'failure'; }],
    ['incomplete trigger', run => { run.status = 'in_progress'; }],
    ['older run', run => { run.id = 99; }],
    ['older attempt', run => { run.run_attempt = 0; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture({ automatic: true }); mutate(f.context.payload.workflow_run); await assert.rejects(f.run());
  });
});

test('rebuilding the same SHA has a distinct publisher run/attempt tag', async () => {
  const f = fixture(); f.context.runId = 201; f.env.GITHUB_RUN_ATTEMPT = '3'; await f.run();
  assert.equal(f.outputs.image_tag, `sha-${sha}-run-201-3`);
});

test('publication revalidates source and CI after the environment approval wait', async t => {
  const good = fixture(); await good.run(); await good.revalidate();
  const cases = [
    ['staging moved', f => { f.state.head = otherSha; }],
    ['head moves during recheck', f => { f.state.refReads = 0; f.state.secondHead = otherSha; }],
    ['publication disabled', f => { f.env.STAGING_IMAGES_ENABLED = 'false'; }],
    ['untrusted repository', f => { f.context.repo.owner = 'someone'; }],
    ['untrusted workflow ref', f => { f.context.ref = 'refs/heads/staging'; }],
    ['CI now failed', f => { f.state.runs[0].conclusion = 'failure'; }],
    ['CI rerun pending', f => { f.state.runs[0].run_attempt = 2; f.state.runs[0].status = 'in_progress'; }],
    ['CI rerun succeeded', f => { f.state.runs[0].run_attempt = 2; }],
    ['newer CI run succeeded', f => { f.state.runs.push({ ...f.state.runs[0], id: 101 }); }],
    ['CI disappeared', f => { f.state.runs = []; }],
    ['CI API unavailable', f => { f.github.paginate = async () => { throw new Error('synthetic unavailable'); }; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture(); await f.run(); mutate(f); await assert.rejects(f.revalidate());
  });
});

const config = { STAGING_API_URL: 'https://api.staging.example.test', STAGING_SAAS_BASE_DOMAIN: 'staging.example.test',
  STAGING_DEFAULT_TENANT: 'demo', STAGING_GOOGLE_CLIENT_ID: '' };
test('public build settings require explicit staging targets and reject known production origins', async t => {
  await validateConfig({}, {}, {}, { env: config });
  await validateConfig({}, {}, {}, { env: { ...config, STAGING_GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com' } });
  const cases = [
    ['STAGING_API_URL', ''], ['STAGING_API_URL', 'invalid'], ['STAGING_API_URL', 'http://api.staging.example.test'],
    ['STAGING_API_URL', 'https://api.staging.example.test/'],
    ['STAGING_API_URL', 'https://api.staging.example.test/api'],
    ['STAGING_API_URL', 'https://api.staging.example.test/path/..'],
    ['STAGING_API_URL', 'https://api.staging.example.test:443'],
    ['STAGING_API_URL', 'https://API.STAGING.EXAMPLE.TEST'],
    ['STAGING_API_URL', 'https://user:password@api.staging.example.test'],
    ['STAGING_API_URL', 'https://api.staging.example.test?token=synthetic'],
    ['STAGING_API_URL', 'https://api.staging.example.test#fragment'],
    ['STAGING_API_URL', 'https://api.staging.example.test\nOTHER=value'],
    ['STAGING_API_URL', 'https://apifalcon.jataka.io'], ['STAGING_API_URL', 'https://falcon.jataka.io.'],
    ['STAGING_API_URL', 'https://APIFALCON.JATAKA.IO'], ['STAGING_API_URL', 'https://child.apifalcon.jataka.io'],
    ['STAGING_API_URL', 'https://sgvu.jataka.io'], ['STAGING_SAAS_BASE_DOMAIN', ''],
    ['STAGING_SAAS_BASE_DOMAIN', 'https://staging.example.test'], ['STAGING_SAAS_BASE_DOMAIN', 'falcon.jataka.io'],
    ['STAGING_DEFAULT_TENANT', ''], ['STAGING_DEFAULT_TENANT', 'demo/path'], ['STAGING_GOOGLE_CLIENT_ID', 'id\nOTHER=value'],
  ];
  for (const [key, value] of cases) await t.test(`${key}: ${JSON.stringify(value)}`, async () => {
    await assert.rejects(validateConfig({}, {}, {}, { env: { ...config, [key]: value } }));
  });
  await assert.rejects(validateConfig({}, {}, {}, { env: { ...config, STAGING_SAAS_BASE_DOMAIN: 'jataka.io', STAGING_DEFAULT_TENANT: 'sgvu' } }));
  await assert.rejects(validateConfig({}, {}, {}, { env: { ...config, STAGING_SAAS_BASE_DOMAIN: 'jataka.io', STAGING_DEFAULT_TENANT: 'demo' } }));
  await assert.rejects(validateConfig({}, {}, {}, { env: {} }));
});

test('publisher is an inert template and every privileged job is opt-in and main-only', () => {
  assert.equal(fs.existsSync(path.join(__dirname, '../workflows/publish-staging-images.yml')), false,
    'Activation is a separate reviewed change, including updating this template test.');
  const validationJob = workflow.split('  validate:\n')[1].split('\n  publish:\n')[0];
  const publicationJob = workflow.split('  publish:\n')[1];
  for (const job of [validationJob, publicationJob]) assert.match(job,
    /if: >-\n      vars\.STAGING_IMAGES_ENABLED == 'true' &&\n      github\.repository == 'shodh-ai\/Falcon' &&\n      github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /^permissions:\n  contents: read\n/m);
  assert.match(validationJob, /actions: read/);
  assert.doesNotMatch(validationJob, /uses: actions\/checkout|packages: write/);
  assert.match(publicationJob, /needs: validate/);
  assert.match(publicationJob, /environment: staging-build/);
  assert.match(publicationJob, /actions: read/);
  assert(publicationJob.indexOf('// BEGIN PUBLICATION REVALIDATION') < publicationJob.indexOf('uses: actions/checkout@v4'));
  assert.equal((workflow.match(/packages: write/g) || []).length, 1);
  assert.match(publicationJob, /persist-credentials: false/);
  assert.deepEqual([...workflow.matchAll(/secrets\.([A-Z_]+)/g)].map(match => match[1]), ['GITHUB_TOKEN']);
  assert.doesNotMatch(workflow.split('\npermissions:')[0], /source_branch:/);
  assert.match(workflow, /image: ghcr\.io\/shodh-ai\/falcon-staging-backend/);
  assert.match(workflow, /image: ghcr\.io\/shodh-ai\/falcon-staging-frontend/);
  assert.match(workflow, /image_by_digest:.*IMAGE_DIGEST/);
  assert.match(workflow, /outputs: type=registry,push=true,oci-mediatypes=false/);
  assert.doesNotMatch(workflow, /ghcr\.io\/shodh-ai\/falcon-(?:backend|frontend)|pull_request_target|COOLIFY_.*WEBHOOK|PRODUCTION_|MIGRATION_DB_|db:migrate|:production\b|:latest\b/);
});
