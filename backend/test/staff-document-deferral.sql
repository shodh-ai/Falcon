-- Run against a local test database with psql -v ON_ERROR_STOP=1 -f this-file.
-- Everything, including the isolated schema, is rolled back.
BEGIN;
CREATE SCHEMA staff_document_deferral_test;
SET LOCAL search_path = staff_document_deferral_test, public;
CREATE TABLE tenants (tenant_id uuid PRIMARY KEY);
CREATE TABLE users (user_id uuid PRIMARY KEY);
CREATE TABLE departments (dept_id integer PRIMARY KEY);
\ir ../migrations/20261015120000_staff_profile_hr_verification.sql
\ir ../migrations/20261019150000_staff_profile_document_deferral.sql
\ir ../migrations/20261019150000_staff_profile_document_deferral.sql
INSERT INTO tenants VALUES ('10000000-0000-4000-8000-000000000001'), ('10000000-0000-4000-8000-000000000002');
INSERT INTO users VALUES ('20000000-0000-4000-8000-000000000001'), ('20000000-0000-4000-8000-000000000002');
INSERT INTO staff_profile_reviews (review_id, tenant_id, user_id, source, status, submitted_snapshot_hash, documents_deferred)
VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'PHARMACY_RECHECK', 'APPROVED', repeat('a', 64), true);
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    UPDATE staff_profile_reviews SET documents_deferred = false;
  EXCEPTION WHEN raise_exception THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Approved parent was mutable'; END IF;
END $$;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO staff_profile_document_verifications (review_id, tenant_id, user_id, verified_by, document_manifest, manifest_hash)
    VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '[]', repeat('b',64));
  EXCEPTION WHEN raise_exception THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Cross-tenant decision allowed'; END IF;
END $$;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO staff_profile_document_verifications (review_id, tenant_id, user_id, verified_by, document_manifest, manifest_hash)
    VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '[]', repeat('b',64));
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'Self verification allowed'; END IF;
END $$;
INSERT INTO staff_profile_document_verifications (review_id, tenant_id, user_id, verified_by, document_manifest, manifest_hash)
VALUES ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '[]', repeat('b',64));
DO $$
DECLARE update_blocked boolean := false; delete_blocked boolean := false;
BEGIN
  BEGIN
    UPDATE staff_profile_document_verifications SET manifest_hash = repeat('c',64);
  EXCEPTION WHEN raise_exception THEN update_blocked := true;
  END;
  BEGIN
    DELETE FROM staff_profile_document_verifications;
  EXCEPTION WHEN raise_exception THEN delete_blocked := true;
  END;
  IF NOT update_blocked OR NOT delete_blocked THEN RAISE EXCEPTION 'Document decision was mutable'; END IF;
END $$;
ROLLBACK;
