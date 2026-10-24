# Falcon development, staging and production workflow

## Current status — 24 October 2026

Repository: [shodh-ai/Falcon](https://github.com/shodh-ai/Falcon). The inspected
production source baseline is `7b3c8a99228c594be16327ed004a54d5cd6da524`.

`main` and the newly created `develop` branch are protected on GitHub. Both require
one teammate approval on the latest changes, up-to-date passing checks, and
resolved review conversations. Stale approvals are dismissed. Administrators
must follow these rules, and force pushes and branch deletion are blocked.

The workflow changes in this feature branch still need PR review and merging.
**Shared staging and PR previews are not operational yet.** There is no confirmed
staging URL. The new staging publisher is disabled until explicitly configured.
The remaining hosting and approval steps are in [STAGING_SETUP.md](docs/STAGING_SETUP.md).
Actual checks and limitations are recorded in [WORKFLOW_VALIDATION.md](docs/WORKFLOW_VALIDATION.md).

## What was found

| Area | Confirmed configuration |
| --- | --- |
| Frontend | `frontend/`: Next.js 16.3.1, React 19, TypeScript, Tailwind, standalone Docker image |
| Backend | `backend/`: NestJS 11, TypeScript, TypeORM and PostgreSQL |
| Supporting services | Redis/BullMQ; persistent uploads and S3/MinIO integrations |
| Authentication | Local JWT/bcrypt accounts and Google OAuth; no Supabase configuration found |
| Other integrations | SMTP/password reset, payment providers/webhooks, Gemini, GST and module integrations |
| Other client | `falcon-mobile/`: Expo/React Native; this setup targets the existing web portal |
| Tests | `tests/` Jest/Playwright; backend Jest and frontend Vitest; existing coverage/security checks |
| Hosting | Repository workflows and operational docs use Coolify and GHCR, not Vercel |
| Configured production URLs | [Web](https://falcon.jataka.io), [API](https://apifalcon.jataka.io) |

Production credentials belong in hosting/runtime configuration. GitHub inspection
returned no repository or production-environment Actions secret/variable names.
The actual Coolify settings and live database configuration were not accessible
in this task; do not infer that the documented webhooks are configured.

The original local checkout is on `qa`, ahead of its remote with unrelated edits.
It has been left untouched. Work for this setup is isolated on
`feature/development-workflow`. Existing `qa`, `testing`, `master`, role branches
and other developers' branches were not deleted, renamed or merged. There was
no established remote `develop`; it was created from the inspected `main` SHA.

## Branches and required checks

| Branch | Purpose | Normal PR destination |
| --- | --- | --- |
| `main` | Reviewed production-ready code | Release PR from `develop` |
| `develop` | Shared integration and staging candidates | Receives feature/fix PRs |
| `feature/<short-name>` | One new feature | `develop` |
| `fix/<short-name>` | One bug fix | `develop` |

Required checks are `Storage and database deployment boundaries`,
`Notification and sender security`, and `ci`, all from GitHub Actions. A failed
check blocks merging. Do not remove a check to release a failing change.
The applied settings are recorded in [.github/branch-protection.json](.github/branch-protection.json).
Production deployment approval is a separate GitHub Environment setting and
still needs the owner to select reviewers.

## 1. Start a feature or bug fix

Use a clean clone or worktree. Do not switch branches over someone else's
uncommitted work. For a new clone:

```sh
git clone git@github.com:shodh-ai/Falcon.git
cd Falcon
git fetch origin
git switch --create feature/my-feature origin/develop
```

Use `fix/my-bug` instead for a bug. In an existing clone, start with `git status`
and make sure the working directory is clean, then use the last two commands.

Install each package from its committed lockfile:

```sh
npm ci --prefix backend
npm ci --prefix frontend
npm ci --prefix tests
```

The existing Dockerfiles use Node 20; CI uses Node 20 and a dedicated Node
22.23.3 notification job. Use the repository's runtime versions when reproducing
CI, rather than changing dependency versions during setup.

For local running, configure a **disposable local** PostgreSQL/Redis setup and
local-only credentials first. `backend/.env.example` documents configuration
names. Never copy a teammate's production `.env`. Keep databases, upload storage,
JWT secrets and provider accounts separate. See the reviewed setup constraints
in [STAGING_SETUP.md](docs/STAGING_SETUP.md) before migration or startup commands.

Once your isolated database/schema and environment are ready, run each service
in its own terminal:

```sh
npm --prefix backend run start:dev
npm --prefix frontend run dev
```

Frontend defaults to `http://localhost:3000`; backend defaults to port 4000.
No database migration command is a prerequisite to be run blindly: the historical
migration directory includes data seeds and requires review for new environments.

## 2. Check and push your changes

These checks do not require a deployed portal:

```sh
npm --prefix tests run test:unit -- --runInBand
npm --prefix tests run lint
npm --prefix tests run lint:frontend:tests
npm --prefix frontend test
npm --prefix backend run build --ignore-scripts
npm --prefix frontend run build
node --test .github/tests/staging-workflow.spec.cjs
```

Keep local `.env` files and real credentials out of test/build sessions. The full
`npm run test:ci` pipeline also needs the disposable test database, approved test
schema and Playwright Chromium. GitHub CI supplies its own database service.
Do not run the full suite against production or an environment containing real data.
Its migration helper reads `tests/.env.test`, and reset helpers can truncate tables.

Review and commit only your intended files:

```sh
git diff
git add path/to/changed-file
git commit -m "Describe the change"
git push --set-upstream origin feature/my-feature
```

Use real filenames in the `git add` command. Never commit `.env` files, credential
exports or production data. Keep lockfile changes only when intentionally changing
dependencies.

## 3. Open a Pull Request

On GitHub choose **Pull requests → New pull request**, set **base: develop** and
**compare: feature/my-feature** (or your fix branch). Describe the change, affected
roles, verification, database implications and rollback plan using the PR template.
Request review from a teammate with repository write access. You can also use:

```sh
gh pr create --base develop --head feature/my-feature
```

Wait for all checks. New commits dismiss old approvals. If GitHub reports that
your branch is behind, merge `origin/develop` into your feature branch, resolve
conflicts locally, rerun checks and push normally. Do not force-push shared branches.

## 4. Test an individual PR

There is no automatic PR preview URL today. Use local test evidence until staging
infrastructure is provisioned. Never point a preview at the production API.

After the owner completes staging setup, a non-draft same-repository feature/fix
PR into `develop`, approved at its current SHA with successful CI, can have staging
images published manually. In **Actions → Publish staging images → Run workflow**,
select workflow branch `main` or `develop`, enter `source_branch` and its full
`source_sha`. The workflow checks eligibility and produces image manifests; it
does not deploy a preview.

The operator uses those manifests to create a separate Coolify preview application
and adds its actual URL to the PR. A trusted frontend-only preview can use the
isolated synthetic staging API with a reviewed CORS/auth setup. Backend changes
need their own isolated database, Redis, storage and runtime boundary configuration.
Do not overwrite shared staging with an unmerged feature. Complete details and
preview cleanup are in [STAGING_SETUP.md](docs/STAGING_SETUP.md).

The current publisher uses shared staging public build settings. A full-stack
preview with its own API also needs a separate reviewed build configuration and
new images; this is not implemented here. Use isolated local full-stack testing
until that additional hosting/build workflow is ready.

## 5. Merge into shared staging

After checks and teammate approval, merge the PR into `develop`. This starts
`Falcon CI` on the resulting integration commit. Once enabled and installed on
the default branch, `Publish staging images` runs after successful `develop`
push CI and publishes separate `falcon-staging-backend` and
`falcon-staging-frontend` images.

Tags include the full SHA, run ID and attempt; manifests also contain image
digests. The operator must pin the matching pair in the separate Coolify staging
applications and deploy them there. **Automatic deployment hooks are intentionally
not configured:** host resources, credentials, schema, and runtime boundaries must
first be provisioned and verified. Image publication alone does not mean staging
is running or has passed testing.

## 6. Test and approve the integrated release

Record the deployed source SHA, image pair, actual staging URL, tester, date and
results. Verify affected portal roles and permissions, sign-in/sign-out, password
reset using an isolated mail setup, file upload/download, changed workflows and
error paths. Use synthetic accounts and records. Test integrations only with
explicitly configured test accounts or mocks. Record bugs as `fix/*` PRs into
`develop`, then retest the updated integrated revision.

## 7. Release approved code to production

1. Open a PR with **base: main**, **compare: develop**. Attach staging evidence,
   migration review, the previous good image pair, and the release owner's approval.
2. Wait for all CI checks and a teammate's approval. Any additional changes need
   retesting. Use a normal merge commit for this long-lived release PR so the branch
   histories remain straightforward; do not delete `develop` afterward.
3. After the approved merge, `Falcon CI` tests the main commit. Existing
   `Publish production images` publishes production-configured SHA images after
   successful main push CI. This is a new build because public environment values
   differ from staging. Confirm its success and the source revision.
4. A release owner must separately authorize deployment. First complete the
   production Environment reviewer gate and verify Coolify is not auto-deploying
   candidates. Then follow the existing reviewed storage/resource preflight and
   migration procedure in [ROLLOUT.md](ops/deployment-safety/ROLLOUT.md).
5. Only the authorized operator runs **Promote production images**, from `main`,
   with the verified full main SHA. `deploy=false` still changes production image
   tags; it is **not a dry run**. `deploy=true` also calls configured Coolify hooks.
   Confirm actual webhook/dashboard configuration before using either mode.
6. Verify the deployed image digests/revision and perform approved smoke checks.
   A public HTTP health response can come from the old container and does not
   prove the new version deployed.

The existing manual publish/promote workflows do not independently prove main
ancestry and passing CI for an arbitrary supplied SHA. Environment reviewers must
check these explicitly using the release checklist in STAGING_SETUP.md. No
production workflow was dispatched as part of this setup.

After release, open a reviewed PR from `main` back into `develop` when needed so
hotfixes and release merge history are incorporated. Never reset either branch.

## 8. Fix bugs and roll back safely

For ordinary bugs, branch `fix/<name>` from `develop`, test, review and follow the
same staging/release path. For an urgent live bug, an owner can authorize a fix
branch from `origin/main` and a reviewed PR into `main`; keep CI and approval gates,
then bring the fix back to `develop` through a separate PR.

For a faulty release, stop further deployments and have the release owner approve
restoring the previous known-good frontend/backend image pair. Check schema
compatibility first. Follow current preflight and promotion checks; if an older
image fails newer safety requirements, do not bypass them—prepare a reviewed
compatible forward fix. Never reset Git history, automatically reverse migrations,
or restore a production database as part of an application rollback.

Use a PR containing a `git revert` when the faulty source change must be undone.
Reverting a merge needs the correct parent chosen by the release owner. Retest
the rollback/fix in staging and reconcile both long-lived branches afterward.

## Owner completion checklist

1. Review and merge this setup PR into `develop`; run CI. Release it to `main`
   through a separate reviewed PR so the `workflow_run` publisher is registered.
2. In [GitHub Environments](https://github.com/shodh-ai/Falcon/settings/environments),
   choose production reviewers, prevent self-review/bypass, and allow only `main`.
3. Provision isolated Coolify staging resources, approved synthetic schema/data,
   protected runtime baseline, and staging-only configuration. Do not copy live data.
4. Create the protected `staging` GitHub Environment with the documented public
   build variables; allow workflow branches `main` and `develop` only. Keep database,
   SMTP and other private credentials in the staging runtime, not image build args.
5. Only then set repository variable `STAGING_IMAGES_ENABLED=true`. Publish a
   passing candidate, pin its exact image pair, deploy staging, and verify it.
6. Record the real staging/preview URLs and test evidence before the first release.

For exact dashboard fields, environment names, provider safeguards and rollback
checks, follow [STAGING_SETUP.md](docs/STAGING_SETUP.md). Branch protection is live;
the hosting portion remains incomplete until these owner steps are finished.
