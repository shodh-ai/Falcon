# Gyan Vihar Medical College finance launch

This launch profile exposes only Falcon's Finance/Procurement suite and the
Inventory/Asset suite required for the complete DoFA Modules 1–9 + Module X
lifecycle. HRMS, SIS, Admissions and the other business suites remain `OFF`.
High-impact enforcement gates (payment, RFID hardware, sanitization, disposal,
financial recovery and controlled auction) remain `OFF` until their external
integrations and acceptance checks are approved. Their base workflows can be
configured and tested without allowing an unsafe automatic transition.

## Accounts versus features

The P01–P46 identities in the QA plan are test personas used to prove every
positive, negative and maker-checker path. They are not forty features and they
are not a requirement to create forty production users.

The GVMC profile provisions 19 temporary, one-person operational identities.
Several non-conflicting capabilities are combined, while every required
maker-checker boundary still uses distinct user IDs. Assign each credential to
exactly one named staff member; never share an account.

## Safe provisioning

Preview without changing the database:

```bash
cd backend
npm run tenant:provision:gvmc-finance -- --plan
```

After normal migrations and an approved production change window:

```bash
GVMC_FINANCE_PROVISION_CONFIRM=GVMC-FINANCE-LAUNCH \
GVMC_CONSTRUCTION_BUDGET_INR=<approved-limit> \
npm run tenant:provision:gvmc-finance -- --apply \
  --credentials-out=/run/secrets/gvmc-finance-credentials.json
```

The provisioner is idempotent. It does not reset existing passwords. The
credential file is created with mode `0600`, is excluded from Git when written
under `backend/data/private-launch-credentials/`, and contains passwords only
for accounts created in that run. Transfer it to the authorized college owner
through an approved secret channel, then destroy the file after handoff.
`GVMC_CONSTRUCTION_BUDGET_INR` must be the approved construction funding cap;
the provisioner refuses to invent a financial limit.

Launch URL:

```text
https://falcon.jataka.io/?tenant=gvmc
```

The first request remembers the tenant in a same-site cookie. Every API request
still requires the tenant-bound JWT, capability and object scope; changing the
query parameter or cookie cannot grant cross-tenant access.

## Production gate

Do not claim the college is live until all of the following pass:

1. Latest frontend/backend images and migrations are deployed.
2. `/api/platform/modules/runtime` returns `finance_procurement=ACTIVE`,
   `inventory_assets=ACTIVE`, and every unrelated suite `OFF` for `gvmc`.
3. All 19 users change their temporary password.
4. Named staff assignments and DoFA approval routes are approved.
5. Funding sources, fiscal period, departments, locations and signing keys are
   configured.
6. Finance/DoFA smoke tests cover acquisition, approval, PO, GRN, invoice,
   integrity clearance, payment gate, inventory, returns, service and retirement.
7. Cross-tenant denial and maker-checker tests pass.

Production is currently blocked if Coolify/SSH management access is unavailable;
committed code and a generated plan do not constitute deployment or provisioning.
