-- Architect Blueprint integration: cross-feature documentation + resilient hooks

-- Soft-unlock note: fellowship PASSED students get ELITE_FELLOW waiver via API.
-- Golden Ticket winners land in admissions_leads + tokamak_network_members via competitions service.
-- Moonshot IP_LINKED status stores ecell_ip_agreements.agreement_id.
-- LabAdmin DOFA 200000 enables Tokamak fast-path POs via coo-ops.

DO $$
BEGIN
  RAISE NOTICE 'Blueprint integration migration applied (hooks live in Nest services)';
END $$;
