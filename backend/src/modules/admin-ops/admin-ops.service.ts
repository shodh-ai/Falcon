import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CacheService } from '../../core/redis/cache.service';

@Injectable()
export class AdminOpsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly cache: CacheService,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listAssets(tenantId?: string) {
    return this.db.query(
      `SELECT a.*, u.name AS assigned_user_name
       FROM university_assets a
       LEFT JOIN users u ON u.user_id = a.assigned_user_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async assignAsset(
    tenantId: string,
    assetId: string,
    dto: { assigned_user_id?: string; assigned_room?: string; status?: string },
  ) {
    const managed = await this.db.query(
      `SELECT module5_managed FROM university_assets WHERE asset_id=$1 AND tenant_id=$2`,
      [assetId, this.tenant(tenantId)],
    );
    if (managed[0]?.module5_managed)
      throw new ConflictException({
        message:
          'Module-5-managed assets must be changed through the inventory workflow',
        code: 'MODULE5_LEGACY_WRITE_BLOCKED',
      });
    return this.db.query(
      `UPDATE university_assets
       SET assigned_user_id = COALESCE($3, assigned_user_id),
           assigned_room = COALESCE($4, assigned_room),
           status = COALESCE($5, status)
       WHERE asset_id = $1 AND tenant_id = $2
       RETURNING *`,
      [
        assetId,
        this.tenant(tenantId),
        dto.assigned_user_id ?? null,
        dto.assigned_room ?? null,
        dto.status ?? 'ASSIGNED',
      ],
    );
  }

  createAsset(tenantId: string, dto: Record<string, unknown>) {
    return this.db.query(
      `INSERT INTO university_assets (tenant_id, asset_tag, asset_type, name, assigned_user_id, assigned_room, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        this.tenant(tenantId),
        dto.asset_tag,
        dto.category ?? dto.asset_type ?? 'IT',
        dto.name,
        dto.assigned_to_user ?? dto.assigned_user_id ?? null,
        dto.assigned_room ?? null,
        dto.status ?? 'AVAILABLE',
      ],
    );
  }

  listFleet(tenantId?: string) {
    return this.db.query(
      `SELECT f.*, driver.name AS driver_name
       FROM fleet_vehicles f
       LEFT JOIN users driver ON driver.user_id = f.driver_user_id
       WHERE f.tenant_id = $1
       ORDER BY f.registration_no ASC`,
      [this.tenant(tenantId)],
    );
  }

  createFleetVehicle(tenantId: string, dto: Record<string, unknown>) {
    return this.db.query(
      `INSERT INTO fleet_vehicles (tenant_id, registration_no, vehicle_type, driver_user_id, capacity, route_details, route_zone)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        this.tenant(tenantId),
        dto.registration_no,
        dto.vehicle_type ?? 'BUS',
        dto.driver_user_id ?? null,
        dto.capacity ?? null,
        dto.route_details ?? null,
        dto.route_zone ?? null,
      ],
    );
  }

  fuelLogs(tenantId?: string) {
    return this.db.query(
      `SELECT l.*, v.registration_no
       FROM fleet_fuel_logs l
       JOIN fleet_vehicles v ON v.vehicle_id = l.vehicle_id
       WHERE l.tenant_id = $1
       ORDER BY l.fuel_date DESC`,
      [this.tenant(tenantId)],
    );
  }

  listEvents(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM admin_campus_events WHERE tenant_id = $1 ORDER BY event_start DESC`,
      [this.tenant(tenantId)],
    );
  }

  createEvent(tenantId: string, dto: Record<string, unknown>) {
    const pass = `GP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    return this.db.query(
      `INSERT INTO admin_campus_events
         (tenant_id, title, venue, event_start, event_end, budget_amount, guest_pass_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        this.tenant(tenantId),
        dto.title,
        dto.venue,
        dto.event_start,
        dto.event_end,
        dto.budget_amount ?? 0,
        pass,
      ],
    );
  }

  listTimetable(tenantId?: string, academicYear?: string) {
    const tid = this.tenant(tenantId);
    const yearKey = academicYear ?? 'all';
    const cacheKey = `timetable:${tid}:${yearKey}`;
    return this.cache.getOrSet(cacheKey, () =>
      this.db.query(
        `SELECT s.*, u.name AS faculty_name
         FROM admin_timetable_slots s
         LEFT JOIN users u ON u.user_id = s.faculty_user_id
         WHERE s.tenant_id = $1 AND ($2::text IS NULL OR s.academic_year = $2)
         ORDER BY s.day_of_week, s.start_time`,
        [tid, academicYear ?? null],
      ),
    );
  }

  async upsertTimetableSlot(tenantId: string, dto: Record<string, unknown>) {
    const conflicts = await this.db.query(
      `SELECT slot_id, room_code, course_code
       FROM admin_timetable_slots
       WHERE tenant_id = $1 AND room_code = $2 AND day_of_week = $3
         AND academic_year = $4
         AND start_time < $6::time AND end_time > $5::time`,
      [
        this.tenant(tenantId),
        dto.room_code,
        dto.day_of_week,
        dto.academic_year,
        dto.start_time,
        dto.end_time,
      ],
    );
    if (conflicts.length) {
      throw new BadRequestException(
        `Clash Detected: Room ${dto.room_code} already booked (${(conflicts[0] as { course_code: string }).course_code})`,
      );
    }
    if (dto.faculty_user_id) {
      const facultyClash = await this.db.query(
        `SELECT slot_id, course_code, room_code
         FROM admin_timetable_slots
         WHERE tenant_id = $1 AND faculty_user_id = $2 AND day_of_week = $3
           AND academic_year = $4
           AND start_time < $6::time AND end_time > $5::time`,
        [
          this.tenant(tenantId),
          dto.faculty_user_id,
          dto.day_of_week,
          dto.academic_year,
          dto.start_time,
          dto.end_time,
        ],
      );
      if (facultyClash.length) {
        throw new BadRequestException(
          `Clash Detected: Faculty already assigned to ${(facultyClash[0] as { course_code: string }).course_code} in room ${(facultyClash[0] as { room_code: string }).room_code}`,
        );
      }
      const workload = await this.checkFacultyWorkload(
        this.tenant(tenantId),
        String(dto.faculty_user_id),
        String(dto.academic_year),
        dto.start_time as string,
        dto.end_time as string,
      );
      if (workload.exceeds_limit) {
        throw new BadRequestException(
          `Workload Enforcer: ${workload.faculty_name} would exceed UGC limit of 16 hrs/week (projected ${workload.weekly_hours}h)`,
        );
      }
    }
    const tid = this.tenant(tenantId);
    const result = await this.db.query(
      `INSERT INTO admin_timetable_slots
         (tenant_id, room_code, day_of_week, start_time, end_time, course_code, faculty_user_id, academic_year)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tid,
        dto.room_code,
        dto.day_of_week,
        dto.start_time,
        dto.end_time,
        dto.course_code ?? null,
        dto.faculty_user_id ?? null,
        dto.academic_year,
      ],
    );
    await this.cache.delByPrefix(`timetable:${tid}:`);
    return result;
  }

  transportZones(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM admin_transport_zones WHERE tenant_id = $1`,
      [this.tenant(tenantId)],
    );
  }

  private async checkFacultyWorkload(
    tenantId: string,
    facultyUserId: string,
    academicYear: string,
    newStart: string,
    newEnd: string,
  ) {
    const slots = await this.db.query(
      `SELECT start_time, end_time FROM admin_timetable_slots
       WHERE tenant_id = $1 AND faculty_user_id = $2 AND academic_year = $3`,
      [tenantId, facultyUserId, academicYear],
    );
    const toHours = (start: string, end: string) => {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      return (eh * 60 + em - (sh * 60 + sm)) / 60;
    };
    let weeklyHours = toHours(newStart, newEnd);
    for (const slot of slots as Array<{
      start_time: string;
      end_time: string;
    }>) {
      weeklyHours += toHours(slot.start_time, slot.end_time);
    }
    const facultyRows = await this.db.query(
      `SELECT name FROM users WHERE user_id = $1 LIMIT 1`,
      [facultyUserId],
    );
    return {
      faculty_name: (facultyRows[0] as { name?: string })?.name ?? 'Faculty',
      weekly_hours: Math.round(weeklyHours * 10) / 10,
      exceeds_limit: weeklyHours > 16,
    };
  }
}
