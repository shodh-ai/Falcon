-- Allow longer admissions lead stage keys such as DOCUMENT_VERIFICATION.
ALTER TABLE admissions_leads
  ALTER COLUMN stage TYPE VARCHAR(32);
