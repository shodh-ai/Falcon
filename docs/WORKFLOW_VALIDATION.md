# Development workflow validation

Recorded on 24 October 2026. This report distinguishes local checks from checks
that still require dependencies, isolated infrastructure, or GitHub execution.

## Source and local environment

- Clean worktree branch: `feature/development-workflow`.
- Base: `origin/main`, commit `7b3c8a99228c594be16327ed004a54d5cd6da524`.
- Local tools: Node.js `24.14.0`, npm `11.9.0`, Python `3.9.6` on macOS.
- Existing CI uses Ubuntu and Node.js 20 / 22.23.3. Local results do not replace
  those Linux CI checks.
- The original dirty `qa` checkout was not used to run these checks.
- Fresh locked dependency installation succeeded: backend 1,013 packages,
  frontend 863 packages, tests 533 packages. npm emitted deprecation warnings;
  these installation results are not a security audit.
- GitHub `develop` was created at the same base SHA, and branch protections were
  applied to `main` and `develop` during setup. These account changes are separate
  from the local validation results below.

## Checks actually executed

| Check | Actual result |
| --- | --- |
| Node storage, resource, runtime startup, deployment migration and recovery upload boundary tests | **63 passed, 0 failed, 0 skipped** |
| Node notification preparation, notification schema preparation and healthcheck tests | **28 passed, 0 failed, 0 skipped** after dependency installation |
| Python deployment safety suite | **Exit 0**; runner reported `Ran 197 tests` and `OK (skipped=1)` |
| `npm --prefix tests run test:unit -- --runInBand` | **23 suites / 112 tests passed** |
| `npm --prefix tests run lint` | **Passed**, exit 0 |
| `npm --prefix tests run lint:frontend:tests` | **Passed**, exit 0 |
| `npm --prefix frontend test` | **144 files / 963 tests passed** |
| `node --test .github/tests/staging-workflow.spec.cjs` | **66 passed**, including unauthorized reviewer and production API rejection cases |
| Tests TypeScript: `tsc --noEmit -p tsconfig.json` from `tests/` | **Passed**, exit 0 |
| Backend TypeScript: `tsc --noEmit --incremental false -p tsconfig.json` from `backend/` | **Passed**, exit 0 |
| `npm --prefix backend run build --ignore-scripts` | **Passed**, exit 0; no app startup/migration |
| `npm --prefix frontend run build` | **Passed**, exit 0; Next production compilation, TypeScript and page generation completed |
| All four GitHub workflow YAML files parsed with Ruby YAML | **Passed**; GitHub execution still required |
| Environment ignore rules | Staging/production/preview/test `.env` files ignored; example templates remain eligible for version control |
| Syntax checks for notification staging `ingress.cjs` and `review-plan.cjs` | **Passed** |
| `git diff --check` | **Passed** at the time of this report |

The first notification/schema preparation attempt had 26 passes and two missing
dependency failures (`pg-types` and `ts-node`) before backend dependencies were
installed. After a successful fresh `npm ci`, the complete suite was rerun and
all 28 tests passed. No tests were removed or weakened.

The Python skip is the explicitly gated `RuntimeRoleIntegration` class:
`isolated PostgreSQL integration was not explicitly enabled`. It needs a reviewed
local PostgreSQL 18 image, an explicit Docker socket and Linux memory evidence.
Its existing GitHub Actions job remains enabled and unchanged.

The executed suites use injected mocks and temporary synthetic files. Tests ran
with a minimal environment rather than inheriting account credentials. No real
database was contacted, migration applied, application started, email sent, image
published or deployment triggered by these checks.

Commands executed from the repository root:

```sh
env -i PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=test PORTAL_EMAIL_DELIVERY_ENABLED=false \
  node --test backend/scripts/storage-boundary.spec.cjs \
  backend/scripts/resource-boundary.spec.cjs backend/scripts/runtime-start.spec.cjs \
  backend/scripts/deploy-migrate.spec.cjs ops/deployment-safety/tests/recovery_upload_probe.spec.cjs

env -i PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=test PORTAL_EMAIL_DELIVERY_ENABLED=false \
  node --test backend/scripts/notifications/staging/preparation.spec.cjs \
  backend/scripts/notifications/staging/schema/preparation.spec.cjs backend/scripts/healthcheck.spec.cjs

env -i PATH=/usr/local/bin:/usr/bin:/bin FALCON_RUN_ISOLATED_SQL_TESTS=0 \
  python3 -B -m unittest discover -s ops/deployment-safety/tests -v

node --check backend/scripts/notifications/staging/ingress.cjs
node --check backend/scripts/notifications/staging/review-plan.cjs
git diff --check
```

The unit, lint, frontend and preparation reruns used this explicit safe environment
before each command: `env -i PATH=/usr/local/bin:/usr/bin:/bin NODE_ENV=test
PORTAL_EMAIL_DELIVERY_ENABLED=false FALCON_LIVE_API=0 FALCON_E2E_LIVE=0
FALCON_RESET_DB=0 TEST_DATABASE_URL=''`. No local `.env` files were copied into
the worktree. The dependency-based command logs were saved locally in
`/private/tmp/falcon-workflow-unit.log`,
`/private/tmp/falcon-workflow-tests-lint.log`,
`/private/tmp/falcon-workflow-frontend-tests-lint.log`,
`/private/tmp/falcon-workflow-frontend-test.log` and
`/private/tmp/falcon-workflow-preparation.log`.

The `PATH` in these commands is the validated local tool location; other machines
may need their installed Node/Python directories instead.

Builds/typechecks also used a minimal environment. The frontend build used
`NEXT_TELEMETRY_DISABLED=1`, `NEXT_PUBLIC_API_URL=http://127.0.0.1:4000`,
`NEXT_PUBLIC_SAAS_BASE_DOMAIN=localhost` and
`NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN=sgvu`. It did not use production build
settings or credentials. Its log is `/private/tmp/falcon-workflow-frontend-build.log`.
The staging policy test log is `/private/tmp/falcon-workflow-policy.log`.

## CI configuration changes

`.github/workflows/falcon-tests.yml` retains all existing job names, tests, coverage
thresholds, PostgreSQL fixtures, build commands and reports. It adds:

- Read-only repository permissions by default.
- Cancellation of obsolete runs for the same pull request. Push runs use unique
  groups and are not cancelled by this policy, preserving the existing main CI
  result used by the production image publisher.
- Explicit disabled live API/browser test and database reset flags, an empty
  `TEST_DATABASE_URL`, and disabled portal email delivery in the main CI job.
- `FALCON_WEB_URL=http://localhost:3000`, matching the existing test environment
  template and avoiding mismatched mocked browser authentication cookies.
- The new offline staging publisher policy regression suite.

## Not verified by these local checks

Full application ESLint checks, Jest/Vitest coverage, database-backed integration
tests and browser E2E checks remain outside the executed checks listed above.
The full CI chain was not run locally, and the Docker daemon was unavailable.
The Python disposable PostgreSQL test has not passed locally. No deployed staging
URL, preview deployment, hosting authorization or production release is proven by
these local results. Docker image builds and GHCR staging publication have not
been run; the new publisher is disabled until owner configuration.

The existing complete `Falcon CI` workflow must pass on GitHub before a reviewed
change is accepted. An isolated staging deployment must then be tested and
approved before production release.
