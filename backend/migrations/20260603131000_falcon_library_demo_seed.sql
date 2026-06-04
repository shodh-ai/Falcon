-- Demo catalog + copies for OPAC testing

INSERT INTO lib_catalog (tenant_id, isbn, title, author, publisher, edition, category, synopsis, cover_image_url)
SELECT t.tenant_id, '9780132350884', 'Clean Code', 'Robert C. Martin', 'Prentice Hall', '1st', 'Computer Science',
       'A handbook of agile software craftsmanship.',
       'https://books.google.com/books/content?id=uqhFs2VcW8wC&printsec=frontcover&img=1&zoom=1'
FROM tenants t WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, isbn) DO NOTHING;

INSERT INTO lib_catalog (tenant_id, isbn, title, author, publisher, category, synopsis)
SELECT t.tenant_id, '9789332582737', 'Operating System Concepts', 'Silberschatz, Galvin, Gagne', 'Wiley', 'Computer Science',
       'Classic OS textbook.'
FROM tenants t WHERE t.subdomain = 'sgvu'
ON CONFLICT (tenant_id, isbn) DO NOTHING;

INSERT INTO lib_inventory_copies (tenant_id, catalog_id, accession_number, shelf_location, status)
SELECT c.tenant_id, c.catalog_id, v.acc, v.shelf, 'AVAILABLE'
FROM lib_catalog c
CROSS JOIN (VALUES
  ('LIB-CC-001', 'Row 4, Rack B'),
  ('LIB-CC-002', 'Row 4, Rack B'),
  ('LIB-CC-003', 'Row 4, Rack C')
) AS v(acc, shelf)
WHERE c.isbn = '9780132350884'
ON CONFLICT (tenant_id, accession_number) DO NOTHING;

INSERT INTO lib_inventory_copies (tenant_id, catalog_id, accession_number, shelf_location, status)
SELECT c.tenant_id, c.catalog_id, v.acc, v.shelf, 'AVAILABLE'
FROM lib_catalog c
CROSS JOIN (VALUES
  ('LIB-OS-001', 'Row 2, Rack A'),
  ('LIB-OS-002', 'Row 2, Rack A')
) AS v(acc, shelf)
WHERE c.isbn = '9789332582737'
ON CONFLICT (tenant_id, accession_number) DO NOTHING;

INSERT INTO lib_digital_resources (tenant_id, title, resource_type, category, external_url)
SELECT t.tenant_id, v.title, v.rtype, v.cat, v.url
FROM tenants t
CROSS JOIN (VALUES
  ('IEEE Xplore (Campus VPN)', 'JOURNAL', 'Engineering', 'https://ieeexplore.ieee.org'),
  ('NPTEL Video Lectures', 'VIDEO', 'Engineering', 'https://nptel.ac.in'),
  ('Digital Library of India', 'EBOOK', 'General', 'https://archive.org/details/dli')
) AS v(title, rtype, cat, url)
WHERE t.subdomain = 'sgvu'
ON CONFLICT DO NOTHING;
