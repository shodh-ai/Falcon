import { Controller, Get, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { BelongsToModule } from '../../module-control/module-control.decorators';

@Controller('api/hr/gate-verification')
@UseGuards(JwtAuthGuard, RolesGuard)
@BelongsToModule('hrms_ess')
export class GatePassVerificationController {
  constructor(private readonly db: DataSource) {}
  @Get()
  @Roles('Security', 'SuperAdmin')
  async list(@Req() req: { user: { user_id: string; tenant_id?: string } }, @Query('q') q = '') {
    const tenant = requireTenantId(req.user.tenant_id);
    const [actor] = await this.db.query(`SELECT u.user_id,
      EXISTS(SELECT 1 FROM roles r WHERE r.role_name='SuperAdmin' AND (r.role_id=u.role_id OR
        EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id))) AS admin
      FROM users u WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true AND u.deleted_at IS NULL
      AND EXISTS(SELECT 1 FROM roles r WHERE r.role_name IN ('Security','SuperAdmin') AND (r.role_id=u.role_id OR
        EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.user_id AND ur.role_id=r.role_id)))`, [tenant, req.user.user_id]);
    if (!actor) throw new ForbiddenException('An active Security assignment is required');
    return this.db.query(`SELECT g.pass_id,u.name,p.employee_id,d.dept_name,g.out_time::text AS out_time,g.expected_in_time::text AS expected_in_time,
      g.status,(g.out_time<=timezone('Asia/Kolkata',now()) AND g.expected_in_time>=timezone('Asia/Kolkata',now())) AS valid_now
      FROM staff_gate_passes g JOIN users u ON u.user_id=g.staff_user_id AND u.tenant_id=g.tenant_id
      JOIN departments d ON d.dept_id=u.dept_id JOIN schools s ON s.school_id=d.school_id
      LEFT JOIN hr_employee_profiles p ON p.user_id=u.user_id AND p.tenant_id=u.tenant_id
      WHERE g.tenant_id=$1 AND g.status='APPROVED' AND g.deleted_at IS NULL AND u.is_active=true AND u.deleted_at IS NULL
        AND g.out_time::date<=timezone('Asia/Kolkata',now())::date
        AND g.expected_in_time::date>=timezone('Asia/Kolkata',now())::date
        AND ($3::boolean OR s.campus_id IN (
          SELECT school.campus_id FROM users guard JOIN departments dept ON dept.dept_id=guard.dept_id
            JOIN schools school ON school.school_id=dept.school_id WHERE guard.tenant_id=$1 AND guard.user_id=$2
          UNION SELECT CASE WHEN h.entity_id::text ~ '^[0-9]{1,9}$' THEN h.entity_id::int END FROM hierarchy_assignments h WHERE h.user_id=$2
            AND upper(h.entity_type)='CAMPUS' AND h.entity_id::text ~ '^[0-9]+$'))
        AND ($4='' OR u.name ILIKE '%'||$4||'%' OR p.employee_id ILIKE '%'||$4||'%' OR g.pass_id::text=$4)
      ORDER BY g.out_time DESC LIMIT 100`, [tenant, req.user.user_id, actor.admin, String(q).trim().slice(0,100)]);
  }
}
