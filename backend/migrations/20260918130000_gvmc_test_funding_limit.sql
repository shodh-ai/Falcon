-- The earlier GVMC requester repair preserved an existing funding-source UUID
-- and balance.  The legacy launch row carried only INR 1, which made the
-- dedicated end-to-end test source unusable after it was renamed.
--
-- Raise only the explicitly named GVMC test source to the launch baseline.
-- GREATEST prevents this migration from reducing a larger approved balance.
UPDATE acq_funding_sources AS funding
SET allocated_amount = GREATEST(funding.allocated_amount, 10000000),
    is_active = true
FROM tenants AS tenant
WHERE funding.tenant_id = tenant.tenant_id
  AND lower(tenant.subdomain) = 'gvmc'
  AND funding.funding_source_type = 'PROJECT'
  AND funding.name = 'GVMC test funding source';
