-- Dedicated Incubation Admin role (isolated workspace — not Faculty / Admin Ops)

INSERT INTO roles (role_name, description)
VALUES (
  'Incubation_Admin',
  'Dedicated Entrepreneurship & Incubation Cell workspace — startup IP and grant data'
)
ON CONFLICT (role_name) DO UPDATE
SET description = EXCLUDED.description;
