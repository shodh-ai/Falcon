-- Seed dummy classroom data for Room Selection feature
DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Get the first active tenant
  SELECT tenant_id INTO v_tenant_id FROM tenants WHERE is_active = true LIMIT 1;
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No active tenant found, skipping classroom smoke data.';
    RETURN;
  END IF;

  -- Create dummy classrooms if not exists
  IF NOT EXISTS (SELECT 1 FROM campus_spaces WHERE building_name = 'Main Block' AND room_number = 'LT-10') THEN
    INSERT INTO campus_spaces (space_id, tenant_id, building_name, room_number, space_type, capacity, facilities, status)
    VALUES 
      (gen_random_uuid(), v_tenant_id, 'Main Block', 'LT-10', 'CLASSROOM', 120, '{"projector": true, "ac": true, "whiteboard": true}', 'AVAILABLE'),
      (gen_random_uuid(), v_tenant_id, 'Main Block', 'LT-11', 'CLASSROOM', 120, '{"projector": true, "ac": true, "whiteboard": true}', 'AVAILABLE'),
      (gen_random_uuid(), v_tenant_id, 'Science Block', 'SB-101', 'CLASSROOM', 60, '{"projector": true, "whiteboard": true}', 'AVAILABLE'),
      (gen_random_uuid(), v_tenant_id, 'Science Block', 'SB-102', 'CLASSROOM', 60, '{"projector": true, "whiteboard": true}', 'AVAILABLE'),
      (gen_random_uuid(), v_tenant_id, 'CS Block', 'Lab-1', 'CLASSROOM', 40, '{"computers": 40, "projector": true}', 'AVAILABLE'),
      (gen_random_uuid(), v_tenant_id, 'CS Block', 'Lab-2', 'CLASSROOM', 40, '{"computers": 40, "projector": true}', 'AVAILABLE');
    
    RAISE NOTICE 'Inserted 6 smoke classrooms successfully.';
  ELSE
    RAISE NOTICE 'Classrooms already exist.';
  END IF;
END $$;
