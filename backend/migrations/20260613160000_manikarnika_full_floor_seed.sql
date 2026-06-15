-- Full Manikarnika / Block A floor plan: 25 rooms × 3 floors with beds for tatkal catalog

DO $$
DECLARE
  t_id UUID;
  h_id UUID;
  block TEXT;
  floor_name TEXT;
  floor_prefix TEXT;
  r INT;
  room_num TEXT;
  cap INT;
  rid INT;
  b INT;
  bed_label TEXT;
BEGIN
  SELECT tenant_id INTO t_id FROM tenants WHERE subdomain = 'sgvu' LIMIT 1;
  IF t_id IS NULL THEN
    RETURN;
  END IF;

  -- Normalize legacy demo rooms (Block A 101/102) to ground-floor G01/G02
  UPDATE operations_hostel_rooms
  SET room_number = 'G01', floor = 'Ground Floor'
  WHERE hostel_block = 'Block A' AND room_number = '101';

  UPDATE operations_hostel_rooms
  SET room_number = 'G02', floor = 'Ground Floor'
  WHERE hostel_block = 'Block A' AND room_number = '102';

  UPDATE hostel_beds b
  SET bed_number = 'G01-A'
  FROM operations_hostel_rooms r
  WHERE b.room_id = r.room_id AND r.hostel_block = 'Block A' AND r.room_number = 'G01' AND b.bed_number LIKE '101-%';

  UPDATE hostel_beds b
  SET bed_number = 'G02-A'
  FROM operations_hostel_rooms r
  WHERE b.room_id = r.room_id AND r.hostel_block = 'Block A' AND r.room_number = 'G02' AND b.bed_number LIKE '102-%';

  UPDATE hostel_beds b
  SET bed_number = REPLACE(b.bed_number, '101-', 'G01-')
  FROM operations_hostel_rooms r
  WHERE b.room_id = r.room_id AND r.hostel_block = 'Block A' AND r.room_number = 'G01';

  UPDATE hostel_beds b
  SET bed_number = REPLACE(b.bed_number, '102-', 'G02-')
  FROM operations_hostel_rooms r
  WHERE b.room_id = r.room_id AND r.hostel_block = 'Block A' AND r.room_number = 'G02';

  FOR block IN SELECT unnest(ARRAY['Block A', 'MANIKARNIKA']::text[]) LOOP
    SELECT hostel_id INTO h_id
    FROM operations_hostels
    WHERE tenant_id = t_id
      AND (
        upper(hostel_code) = replace(upper(block), ' ', '_')
        OR upper(hostel_code) = upper(block)
        OR (block = 'MANIKARNIKA' AND upper(hostel_code) = 'MANIKARNIKA')
      )
    LIMIT 1;

  FOR floor_name, floor_prefix IN
    SELECT * FROM (VALUES
      ('Ground Floor', 'G'),
      ('1st Floor', '1'),
      ('2nd Floor', '2')
    ) AS v(floor_name, floor_prefix)
  LOOP
    FOR r IN 1..25 LOOP
      IF floor_prefix = 'G' THEN
        room_num := floor_prefix || lpad(r::text, 2, '0');
      ELSE
        room_num := floor_prefix || lpad(r::text, 2, '0');
      END IF;

      cap := 1 + (r % 3);

      INSERT INTO operations_hostel_rooms (
        hostel_id, hostel_block, room_number, floor, capacity, occupied, gender, status
      )
      VALUES (
        h_id,
        block,
        room_num,
        floor_name,
        cap,
        0,
        CASE WHEN block = 'MANIKARNIKA' THEN 'GIRLS' ELSE 'BOYS' END,
        'AVAILABLE'
      )
      ON CONFLICT (hostel_block, room_number) DO UPDATE SET
        floor = EXCLUDED.floor,
        capacity = GREATEST(operations_hostel_rooms.capacity, EXCLUDED.capacity),
        hostel_id = COALESCE(operations_hostel_rooms.hostel_id, EXCLUDED.hostel_id);

      SELECT room_id INTO rid
      FROM operations_hostel_rooms
      WHERE hostel_block = block AND room_number = room_num;

      FOR b IN 1..cap LOOP
        bed_label := room_num || '-' || chr(64 + b);
        INSERT INTO hostel_beds (tenant_id, room_id, bed_number, is_premium, status)
        VALUES (t_id, rid, bed_label, b = 1, 'AVAILABLE')
        ON CONFLICT (room_id, bed_number) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
  END LOOP;
END $$;
