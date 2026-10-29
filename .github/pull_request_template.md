## Change

Describe the problem, the change, and affected portal roles.

## Verification

- [ ] Existing CI checks passed on the current revision; identify anything not run.
- [ ] A teammate reviewed the latest changes.
- [ ] Local or deployed test evidence is attached; state when no deployment exists.
- [ ] No credentials, real user fixtures, production data, or environment files were added.
- [ ] Migration, seed, or reset changes have an explicitly reviewed sequence and recovery plan.

For a release PR from `staging` into `main`, also record:

- Exact tested staging commit, image digests, and included changes:
- Confirmed staging URL, tester, date, and frontend/API/authentication/file/integration results:
- Database compatibility, migration review, and restore/rollback limitations:
- Release owner and separate production deployment authorization:
- Previous known-good images and schema compatibility:

Merging a PR is not authorization to deploy production. Confirm the actual hosting
triggers before a `main` merge. See DEVELOPMENT_WORKFLOW.md.
