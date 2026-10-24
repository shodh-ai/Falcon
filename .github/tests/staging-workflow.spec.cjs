const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const workflow = fs.readFileSync(path.join(__dirname, '../workflows/publish-staging-images.yml'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
// Exercise the actual inline policy, without checking out or executing application code.
function script(name) {
  const start = workflow.indexOf(`// BEGIN ${name}`);
  const end = workflow.indexOf(`// END ${name}`);
  assert(start >= 0 && end > start, `Missing inline policy: ${name}`);
  return new AsyncFunction('github', 'context', 'core', 'process', workflow.slice(start, end));
}
const validateSource = script('SOURCE VALIDATION');
const validateConfig = script('CONFIG VALIDATION');
const sha = 'a'.repeat(40);
const otherSha = 'b'.repeat(40);
const repository = { full_name: 'shodh-ai/Falcon' };

function fixture({ branch = 'develop', automatic = false } = {}) {
  const state = {
    head: sha,
    ci: [{ id: 100, workflow_id: 12, run_attempt: 1, status: 'completed', conclusion: 'success',
      event: branch === 'develop' ? 'push' : 'pull_request', head_branch: branch, head_sha: sha,
      head_repository: repository, pull_requests: [{ number: 7 }] }],
    prs: [{ number: 7, draft: false, user: { id: 1 },
      head: { sha, ref: branch, repo: repository }, base: { ref: 'develop', repo: repository } }],
    reviews: [{ id: 1, state: 'APPROVED', commit_id: sha, user: { id: 2, login: 'reviewer', type: 'User' } }],
    permissions: { reviewer: 'write' },
    permissionError: null,
  };
  const context = {
    repo: { owner: 'shodh-ai', repo: 'Falcon' }, ref: 'refs/heads/main', runId: 200,
    eventName: automatic ? 'workflow_run' : 'workflow_dispatch', payload: {},
  };
  if (automatic) context.payload.workflow_run = state.ci[0];
  const env = { SOURCE_BRANCH: branch, SOURCE_SHA: sha, GITHUB_RUN_ATTEMPT: '2' };
  const outputs = {};
  const github = {
    rest: {
      actions: { getWorkflow: async () => ({ data: { id: 12 } }), listWorkflowRuns: 'runs' },
      git: { getRef: async args => {
        assert.equal(args.ref, `heads/${branch}`);
        return { data: { object: { type: 'commit', sha: state.head } } };
      } },
      pulls: { list: 'prs', listReviews: 'reviews' },
      repos: { getCollaboratorPermissionLevel: async args => {
        assert.equal(args.owner, 'shodh-ai');
        assert.equal(args.repo, 'Falcon');
        if (state.permissionError) throw state.permissionError;
        return { data: { permission: state.permissions[args.username] || 'none' } };
      } },
    },
    paginate: async (method, args) => {
      assert.equal(args.owner, 'shodh-ai');
      assert.equal(args.repo, 'Falcon');
      if (method === 'runs') {
        assert.equal(args.workflow_id, 12);
        assert.equal(args.branch, branch);
        assert.equal(args.head_sha, sha);
        return state.ci;
      }
      return state[method];
    },
  };
  return { state, context, env, outputs,
    run: () => validateSource(github, context, { setOutput: (key, value) => { outputs[key] = value; } }, { env }),
  };
}

test('automatic same-repository develop push records exact revision and a rerun-specific tag', async () => {
  const f = fixture({ automatic: true });
  await f.run();
  assert.deepEqual(f.outputs, {
    source_sha: sha, source_branch: 'develop', ci_run_id: '100', image_tag: `sha-${sha}-run-200-2`,
  });
});

test('rejects untrusted workflow refs, repositories, events, malformed inputs, and moved heads', async t => {
  const cases = [
    ['workflow ref', f => { f.context.ref = 'refs/heads/feature/untrusted'; }],
    ['workflow repository', f => { f.context.repo.owner = 'someone'; }],
    ['event', f => { f.context.eventName = 'pull_request_target'; }],
    ['short SHA', f => { f.env.SOURCE_SHA = 'aaaaaaa'; }],
    ['SHA injection', f => { f.env.SOURCE_SHA = `${sha}\nextra=value`; }],
    ['main source', f => { f.env.SOURCE_BRANCH = 'main'; }],
    ['ref traversal', f => { f.env.SOURCE_BRANCH = 'feature/a..b'; }],
    ['moved head', f => { f.state.head = otherSha; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture(); mutate(f); await assert.rejects(f.run());
    assert.deepEqual(f.outputs, {});
  });
});

test('automatic publication rejects PR events, forks, wrong CI workflows, failures, and other branches', async t => {
  const cases = [
    ['PR event', run => { run.event = 'pull_request'; }],
    ['fork', run => { run.head_repository = { full_name: 'someone/Falcon' }; }],
    ['wrong workflow', run => { run.workflow_id = 99; }],
    ['failure', run => { run.conclusion = 'failure'; }],
    ['feature source', run => { run.head_branch = 'feature/preview'; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture({ automatic: true }); mutate(f.context.payload.workflow_run);
    await assert.rejects(f.run());
  });
});

test('manual develop publication requires exact passing push CI and refuses newer failures or pending runs', async t => {
  await fixture().run();
  const cases = [
    ['no runs', f => { f.state.ci = []; }],
    ['different SHA', f => { f.state.ci[0].head_sha = otherSha; }],
    ['different branch', f => { f.state.ci[0].head_branch = 'main'; }],
    ['fork CI', f => { f.state.ci[0].head_repository = { full_name: 'someone/Falcon' }; }],
    ['PR CI only', f => { f.state.ci[0].event = 'pull_request'; }],
    ['newer failure', f => { f.state.ci.push({ ...f.state.ci[0], id: 101, conclusion: 'failure' }); }],
    ['pending rerun', f => { f.state.ci.push({ ...f.state.ci[0], run_attempt: 2, status: 'in_progress', conclusion: null }); }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture(); mutate(f); await assert.rejects(f.run());
  });
});

test('feature and fix publication requires an approved current PR to develop and that PR CI', async t => {
  await fixture({ branch: 'feature/preview' }).run();
  await fixture({ branch: 'fix/preview' }).run();
  const cases = [
    ['no PR', f => { f.state.prs = []; }],
    ['draft PR', f => { f.state.prs[0].draft = true; }],
    ['wrong PR target', f => { f.state.prs[0].base.ref = 'main'; }],
    ['fork PR', f => { f.state.prs[0].head.repo = { full_name: 'someone/Falcon' }; }],
    ['stale PR', f => { f.state.prs[0].head.sha = otherSha; }],
    ['unapproved PR', f => { f.state.reviews = []; }],
    ['stale approval', f => { f.state.reviews[0].commit_id = otherSha; }],
    ['self approval', f => { f.state.reviews[0].user.id = 1; }],
    ['bot approval', f => { f.state.reviews[0].user.type = 'Bot'; }],
    ['read-only outsider approval', f => { f.state.permissions.reviewer = 'read'; }],
    ['triage-only approval', f => { f.state.permissions.reviewer = 'triage'; }],
    ['unknown reviewer permissions', f => { f.state.permissions = {}; }],
    ['permission API unavailable', f => { f.state.permissionError = new Error('HTTP 403'); }],
    ['dismissed approval', f => { f.state.reviews.push({ ...f.state.reviews[0], id: 2, state: 'DISMISSED' }); }],
    ['requested changes', f => { f.state.reviews.push({ id: 2, state: 'CHANGES_REQUESTED', user: { id: 3, type: 'User' } }); }],
    ['different PR CI', f => { f.state.ci[0].pull_requests = [{ number: 8 }]; }],
    ['push CI only', f => { f.state.ci[0].event = 'push'; }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const f = fixture({ branch: 'feature/preview' }); mutate(f); await assert.rejects(f.run());
  });
});

test('a new current approval resolves earlier requested changes', async () => {
  const f = fixture({ branch: 'fix/preview' });
  f.state.reviews.unshift({ ...f.state.reviews[0], id: 0, state: 'CHANGES_REQUESTED' });
  await f.run();
});

test('maintain/admin approvals authorize publication; an outsider approval alone never does', async t => {
  for (const permission of ['write', 'maintain', 'admin']) await t.test(permission, async () => {
    const f = fixture({ branch: 'feature/preview' });
    f.state.permissions.reviewer = permission;
    await f.run();
  });
  const f = fixture({ branch: 'feature/preview' });
  f.state.reviews.unshift({ id: 0, state: 'APPROVED', commit_id: sha,
    user: { id: 3, login: 'outsider', type: 'User' } });
  f.state.permissions.outsider = 'read';
  await f.run();
});

const config = {
  STAGING_API_URL: 'https://api.staging.example.test', STAGING_SAAS_BASE_DOMAIN: 'staging.example.test',
  STAGING_DEFAULT_TENANT: 'demo', STAGING_GOOGLE_CLIENT_ID: '',
};
test('public config requires an isolated HTTPS URL and explicit tenant settings without fallback', async t => {
  await validateConfig({}, {}, {}, { env: { ...config } });
  await validateConfig({}, {}, {}, { env: { ...config, STAGING_GOOGLE_CLIENT_ID: '123.apps.googleusercontent.com' } });
  const cases = [
    ['STAGING_API_URL', ''], ['STAGING_API_URL', 'invalid'], ['STAGING_API_URL', 'http://api.staging.example.test'],
    ['STAGING_API_URL', 'https://user:password@api.staging.example.test'],
    ['STAGING_API_URL', 'https://api.staging.example.test?token=secret'],
    ['STAGING_API_URL', 'https://api.staging.example.test#token'],
    ['STAGING_API_URL', 'https://api.staging.example.test\nNEXT_PUBLIC_API_URL=bad'],
    ['STAGING_API_URL', 'https://apifalcon.jataka.io'], ['STAGING_API_URL', 'https://falcon.jataka.io./api'],
    ['STAGING_API_URL', 'https://APIFALCON.JATAKA.IO'], ['STAGING_API_URL', 'https://child.apifalcon.jataka.io'],
    ['STAGING_SAAS_BASE_DOMAIN', ''], ['STAGING_SAAS_BASE_DOMAIN', 'https://staging.example.test'],
    ['STAGING_SAAS_BASE_DOMAIN', 'falcon.jataka.io'], ['STAGING_DEFAULT_TENANT', ''],
    ['STAGING_DEFAULT_TENANT', 'demo/path'], ['STAGING_GOOGLE_CLIENT_ID', 'id\nOTHER=value'],
  ];
  for (const [key, value] of cases) await t.test(`${key}: ${JSON.stringify(value)}`, async () => {
    await assert.rejects(validateConfig({}, {}, {}, { env: { ...config, [key]: value } }));
  });
  await assert.rejects(validateConfig({}, {}, {}, {
    env: { ...config, STAGING_SAAS_BASE_DOMAIN: 'jataka.io', STAGING_DEFAULT_TENANT: 'falcon' },
  }));
});

test('publisher remains opt-in with isolated tags, protected build environment, and no source checkout in validation', () => {
  const validationJob = workflow.split('  validate:\n')[1].split('\n  publish:\n')[0];
  assert.match(validationJob, /vars\.STAGING_IMAGES_ENABLED == 'true'/);
  assert.doesNotMatch(validationJob, /uses: actions\/checkout|packages: write|run: \|/);
  assert.equal((workflow.match(/packages: write/g) || []).length, 1);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /image: ghcr\.io\/shodh-ai\/falcon-staging-backend/);
  assert.match(workflow, /image: ghcr\.io\/shodh-ai\/falcon-staging-frontend/);
  assert.match(workflow, /outputs: type=registry,push=true,oci-mediatypes=false/);
  assert.doesNotMatch(workflow, /ghcr\.io\/shodh-ai\/falcon-(?:backend|frontend)|pull_request_target|COOLIFY_.*WEBHOOK|:production\b|:latest\b/);
});
