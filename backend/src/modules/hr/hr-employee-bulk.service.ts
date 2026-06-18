import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { randomBytes } from 'crypto';
import {
  getInitialOnboardingStatusForRole,
} from '../student-onboarding/onboarding-portal.util';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

export type EmployeeRowInput = {
  name: string;
  official_email: string;
  phone?: string;
  role?: string;
  department?: string;
  employee_id?: string;
  designation?: string;
  joining_date?: string;
};

const TEMPLATE_HEADERS = [
  'name',
  'official_email',
  'phone',
  'role',
  'department',
  'employee_id',
  'designation',
  'joining_date',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class HrEmployeeBulkService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  async buildTemplateBuffer(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Employees');
    sheet.addRow([...TEMPLATE_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([
      'Jane Faculty',
      'jane.faculty@mygyanvihar.com',
      '9876543210',
      'Faculty',
      'Computer Science',
      'SGVU-EMP-001',
      'Assistant Professor',
      new Date().toISOString().slice(0, 10),
    ]);
    sheet.columns.forEach((col) => {
      col.width = 22;
    });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async parseUploadFile(buffer: Buffer, filename: string): Promise<EmployeeRowInput[]> {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.csv')) {
      return this.parseCsv(buffer);
    }
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
      return this.parseExcel(buffer);
    }
    throw new BadRequestException('Only .xlsx, .xls, or .csv files are supported');
  }

  private parseCsv(buffer: Buffer): EmployeeRowInput[] {
    const text = buffer.toString('utf8').trim();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) throw new BadRequestException('CSV must include a header row and at least one data row');
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map((line, idx) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? '';
      });
      return this.normalizeRow(row, idx + 2);
    });
  }

  private async parseExcel(buffer: Buffer): Promise<EmployeeRowInput[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = wb.worksheets[0];
    if (!sheet) throw new BadRequestException('Excel file has no worksheets');

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell((cell, col) => {
      headers[col - 1] = String(cell.value ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
    });

    const rows: EmployeeRowInput[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record: Record<string, string> = {};
      row.eachCell((cell, col) => {
        const key = headers[col - 1];
        if (key) record[key] = String(cell.value ?? '').trim();
      });
      if (!Object.values(record).some((v) => v)) return;
      rows.push(this.normalizeRow(record, rowNumber));
    });

    if (!rows.length) throw new BadRequestException('Excel file contains no data rows');
    return rows;
  }

  private normalizeRow(raw: Record<string, string>, line: number): EmployeeRowInput {
    const name = raw.name?.trim();
    const email = (raw.official_email ?? raw.email ?? '').trim().toLowerCase();
    if (!name) throw new BadRequestException(`Row ${line}: name is required`);
    if (!email || !EMAIL_RE.test(email)) {
      throw new BadRequestException(`Row ${line}: invalid email "${email || '(empty)'}"`);
    }
    return {
      name,
      official_email: email,
      phone: raw.phone?.trim() || undefined,
      role: raw.role?.trim() || 'Faculty',
      department: raw.department?.trim() || undefined,
      employee_id: raw.employee_id?.trim() || undefined,
      designation: raw.designation?.trim() || undefined,
      joining_date: raw.joining_date?.trim() || new Date().toISOString().slice(0, 10),
    };
  }

  async createManualEmployee(
    tenantId: string,
    entityId: number,
    actorUserId: string,
    dto: EmployeeRowInput,
  ) {
    const row = this.normalizeRow(
      {
        name: dto.name,
        official_email: dto.official_email,
        phone: dto.phone ?? '',
        role: dto.role ?? 'Faculty',
        department: dto.department ?? '',
        employee_id: dto.employee_id ?? '',
        designation: dto.designation ?? '',
        joining_date: dto.joining_date ?? '',
      },
      1,
    );
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const result = await this.createEmployeeInPipeline(qr, tenantId, entityId, row, actorUserId);
      await qr.commitTransaction();
      this.emitCredentials(tenantId, result);
      return result;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async processBulkUpload(
    tenantId: string,
    entityId: number,
    actorUserId: string,
    buffer: Buffer,
    filename: string,
  ) {
    const rows = await this.parseUploadFile(buffer, filename);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const created: Array<{ user_id: string; email: string; temp_password: string }> = [];
    try {
      for (let i = 0; i < rows.length; i++) {
        const line = i + 2;
        try {
          const result = await this.createEmployeeInPipeline(
            qr,
            tenantId,
            entityId,
            rows[i],
            actorUserId,
          );
          created.push(result);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new BadRequestException({ line, message: msg });
        }
      }
      await qr.commitTransaction();
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }

    for (const emp of created) {
      this.emitCredentials(tenantId, emp);
    }
    return { created: created.length, employees: created.map((e) => ({ user_id: e.user_id, email: e.email })) };
  }

  private emitCredentials(
    tenantId: string,
    emp: { user_id: string; email: string; temp_password: string },
  ) {
    this.notify.onboardingCredentials({
      tenantId,
      userId: emp.user_id,
      email: emp.email,
      tempPassword: emp.temp_password,
      actionLink: '/login',
      title: 'Welcome to Falcon — Your login credentials',
      message: `Your temporary password is ${emp.temp_password}. Please log in and complete onboarding.`,
    });
  }

  async createEmployeeInPipeline(
    qr: QueryRunner,
    tenantId: string,
    entityId: number,
    row: EmployeeRowInput,
    _actorUserId: string,
  ): Promise<{ user_id: string; email: string; temp_password: string }> {
    const email = row.official_email.toLowerCase();

    const existing = await qr.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND lower(official_email) = $2`,
      [tenantId, email],
    );
    if (existing[0]) {
      throw new BadRequestException(`Email already exists: ${email}`);
    }

    const roleName = row.role ?? 'Faculty';
    const roleRows = await qr.query(
      `SELECT role_id FROM roles WHERE lower(role_name) = lower($1) LIMIT 1`,
      [roleName],
    );
    const roleId = roleRows[0]?.role_id;
    if (!roleId) throw new BadRequestException(`Unknown role: ${roleName}`);

    let deptId: number | null = null;
    if (row.department) {
      const deptRows = await qr.query(
        `SELECT dept_id FROM departments WHERE lower(dept_name) = lower($1) LIMIT 1`,
        [row.department],
      );
      deptId = deptRows[0]?.dept_id ?? null;
    }

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const employeeId =
      row.employee_id ||
      `SGVU-${randomBytes(4).toString('hex').toUpperCase()}`;

    const onboardingStatus = getInitialOnboardingStatusForRole(roleName);

    const userRows = await qr.query(
      `INSERT INTO users (tenant_id, name, official_email, role_id, dept_id, password_hash, is_active, entity_id, phone, onboarding_status, onboarding_profile)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, '{}'::jsonb)
       RETURNING user_id`,
      [tenantId, row.name, email, roleId, deptId, passwordHash, entityId, row.phone ?? null, onboardingStatus],
    );
    const userId = userRows[0].user_id as string;

    await qr.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [userId, roleId],
    );

    await qr.query(
      `INSERT INTO hr_employee_profiles (tenant_id, user_id, employee_id, designation, joining_date, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         employee_id = EXCLUDED.employee_id,
         designation = EXCLUDED.designation,
         joining_date = EXCLUDED.joining_date,
         entity_id = EXCLUDED.entity_id`,
      [
        tenantId,
        userId,
        employeeId,
        row.designation ?? row.role ?? 'Staff',
        row.joining_date ?? new Date().toISOString().slice(0, 10),
        entityId,
      ],
    );

    await qr.query(
      `INSERT INTO user_entity_access (user_id, entity_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, entity_id) DO NOTHING`,
      [userId, entityId],
    );

    const templates = await qr.query(
      `SELECT template_id FROM hr_workflow_templates
       WHERE tenant_id = $1 AND entity_id = $2 AND workflow_type = 'ONBOARDING'`,
      [tenantId, entityId],
    );
    for (const tpl of templates) {
      await qr.query(
        `INSERT INTO hr_employee_onboarding_tasks (tenant_id, entity_id, user_id, template_id, status)
         VALUES ($1, $2, $3, $4, 'PENDING')
         ON CONFLICT (user_id, template_id) DO NOTHING`,
        [tenantId, entityId, userId, tpl.template_id],
      );
    }

    return { user_id: userId, email, temp_password: tempPassword };
  }

  private generateTempPassword(): string {
    return `Falcon@${randomBytes(3).toString('hex')}`;
  }
}
