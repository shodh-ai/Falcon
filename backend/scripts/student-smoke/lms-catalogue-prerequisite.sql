-- Explicitly approved missing metadata only. No global module activation.
-- Canonical definition: migrations/20260916120000_lms_independent_launch.sql.
INSERT INTO platform_module_catalog(module_key,display_name,catalogue_version,definition)
VALUES('lms_learning','Learning Management System','1.0.0','{"owner":"academics","independent_launch":true}'::jsonb)
ON CONFLICT(module_key) DO NOTHING;
