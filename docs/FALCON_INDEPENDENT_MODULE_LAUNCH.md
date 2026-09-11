# Falcon independent module launches

Falcon remains one deployed frontend and backend. Business suites are exposed and executed from the runtime state stored in `platform_module_states`.

## Safe defaults

- The migration seeds all suites `ACTIVE` for tenants that already exist.
- A tenant created after the migration has no state rows, so every business suite resolves to `OFF` until approved.
- `CORE` services are not represented by mutable launch state and cannot be disabled.
- Missing control-plane tables temporarily resolve active only during an expand-first rolling deployment; readiness reports the missing schema.

## State resolution

Resolution uses global emergency pause, department, campus, then tenant state. A `PILOT` state is available only when it came from a matching campus or department cohort. Entitlement never replaces RBAC or object scope.

HTTP enforcement runs after authentication and tenant resolution. Business controllers should use `@BelongsToModule(...)`; the route catalogue supplies a compatibility owner for existing controllers. New literal controller prefixes must pass `module-route-coverage.spec.ts`.

Historical GET access is retained for `SuperAdmin`, `TenantAdmin`, and `InternalAuditor`. Other explicitly safe endpoints can use `@AllowModuleHistoryRead()`.

## Rollout governance

Use the Module Launch Console at `/super-admin/modules`, or the `/api/platform` control APIs.

1. Create a rollout with an `Idempotency-Key`.
2. Submit it using `If-Match` and a new `Idempotency-Key`.
3. A different user with the module-owner role approves it using `If-Match` and a new `Idempotency-Key`.
4. Approval applies the state and appends an immutable activation audit row.

Emergency pause accepts an incident reference and may apply immediately. Resume always uses the dual-approval rollout path. Only a Super Admin can request a global emergency pause.

## Cross-module integration

New cross-module writes use `FinancePort`, `HrmsPort`, `AdmissionsPort`, `InventoryPort`, or `ExaminationsPort`, which are aliases of the central `CrossModulePortService`.

The source module commits its facts and outbox first. `dispatch()` either invokes a registered target handler or stores an idempotent deferred handoff. The replay worker waits until the target is available and then retries with the original source revision and idempotency key. Target handlers must reject stale source revisions.

Scheduled SQL work must include `platform_module_is_available(module_key, tenant_id, campus_id, department_id)`. Event consumers must check the central state before consuming an event; skipping leaves the source event available for replay.

## Deployment order

1. Deploy the expand-only migration.
2. Deploy backend and frontend images.
3. Confirm `/api/platform/modules/runtime` and readiness checks.
4. Exercise `SHADOW`, department `PILOT`, `DRAINING`, emergency `PAUSED`, and resume in a non-production cohort.
5. Convert remaining direct cross-module calls to typed ports before independently pausing those specific flows.

Disabling or pausing a suite never drops data or reverses committed source facts.
