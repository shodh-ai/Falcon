## Change

Describe the problem, the change, and affected portal roles.

## Verification

- [ ] Automated checks passed on this revision.
- [ ] A teammate reviewed the latest changes.
- [ ] Preview or local test evidence is attached; state when no preview exists.
- [ ] Database/schema changes have an explicit review and rollback plan.
- [ ] No real credentials, personal data, or production fixtures were added.

For a release PR from `develop` to `main`, also include:

- Tested staging image references and source SHA:
- Staging URL (only if provisioned), test date, tester, and results:
- Production release owner and explicit deployment approval:
- Previous known-good image pair and schema compatibility/rollback notes:

Merging a PR is not authorization to deploy production. See DEVELOPMENT_WORKFLOW.md.
