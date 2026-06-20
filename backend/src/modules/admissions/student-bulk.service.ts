import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import * as ExcelJS from 'exceljs';
import { randomBytes } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { MasterDataService } from '../master-data/master-data.service';
import { getInitialOnboardingStatusForRole } from '../student-onboarding/onboarding-portal.util';

export type StudentRowInput = {
  name: string;
  email: string;
  phone?: string;
  father_name?: string;
  batch?: string;
};

const TEMPLATE_HEADERS = [
  'name',
  'email',
  'phone',
  'father_name',
  'batch',
] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class StudentBulkService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly masterData: MasterDataService,
    private readonly notify: NotificationEmitterService,
  ) {}

  async buildTemplateBuffer(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Students');
    sheet.addRow([...TEMPLATE_HEADERS]);
    sheet.getRow(1).font = { bold: true };
    sheet.addRow([
      'Rahul Sharma',
      'rahul.sharma@student.mygyanvihar.com',
      '9876543210',
      'Mr. Sharma',
      'B.Tech 2026',
    ]);
    sheet.columns.forEach((col) => {
      col.width = 24;
    });
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async parseUploadFile(
    buffer: Buffer,
    filename: string,
  ): Promise<StudentRowInput[]> {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.csv')) return this.parseCsv(buffer);
    if (lower.endsWith('.xlsx') || lower.endsWith('.xls'))
      return this.parseExcel(buffer);
    throw new BadRequestException(
      'Only .xlsx, .xls, or .csv files are supported',
    );
  }

  private parseCsv(buffer: Buffer): StudentRowInput[] {
    const text = buffer.toString('utf8').trim();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV must include a header row and at least one data row',
      );
    }
    const headers = lines[0]
      .split(',')
      .map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
    return lines.slice(1).map((line, idx) => {
      const values = line.split(',').map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = values[i] ?? '';
      });
      return this.normalizeRow(row, idx + 2);
    });
  }

  private async parseExcel(buffer: Buffer): Promise<StudentRowInput[]> {
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

    const rows: StudentRowInput[] = [];
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

    if (!rows.length)
      throw new BadRequestException('Excel file contains no data rows');
    return rows;
  }

  private normalizeRow(
    raw: Record<string, string>,
    line: number,
  ): StudentRowInput {
    const name = raw.name?.trim();
    const email = (raw.email ?? raw.official_email ?? '').trim().toLowerCase();
    if (!name) throw new BadRequestException(`Row ${line}: name is required`);
    if (!email || !EMAIL_RE.test(email)) {
      throw new BadRequestException(
        `Row ${line}: invalid email "${email || '(empty)'}"`,
      );
    }
    return {
      name,
      email,
      phone: raw.phone?.trim() || undefined,
      father_name: raw.father_name?.trim() || undefined,
      batch: raw.batch?.trim() || undefined,
    };
  }

  async processBulkUpload(
    tenantId: string,
    actorUserId: string,
    buffer: Buffer,
    filename: string,
    ruleId?: string,
  ) {
    const rows = await this.parseUploadFile(buffer, filename);
    const enrollmentRuleId = await this.resolveEnrollmentRuleId(
      tenantId,
      ruleId,
    );
    const entityId = await this.resolveDefaultEntityId(tenantId);

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    const created: Array<{
      user_id: string;
      email: string;
      temp_password: string;
    }> = [];
    try {
      for (let i = 0; i < rows.length; i++) {
        const line = i + 2;
        try {
          const result = await this.createStudentInPipeline(
            qr,
            tenantId,
            entityId,
            rows[i],
            enrollmentRuleId,
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

    for (const student of created) {
      this.emitCredentials(tenantId, student);
    }

    return {
      created: created.length,
      students: created.map((s) => ({ user_id: s.user_id, email: s.email })),
    };
  }

  private emitCredentials(
    tenantId: string,
    student: { user_id: string; email: string; temp_password: string },
  ) {
    this.notify.onboardingCredentials({
      tenantId,
      userId: student.user_id,
      email: student.email,
      tempPassword: student.temp_password,
      actionLink: '/login',
      title: 'Welcome to Falcon — Your student portal login',
      message: `Your temporary password is ${student.temp_password}. Please log in and complete onboarding.`,
    });
  }

  private async resolveEnrollmentRuleId(
    tenantId: string,
    ruleId?: string,
  ): Promise<string> {
    if (ruleId?.trim()) return ruleId.trim();
    const rows = await this.dataSource.query(
      `SELECT rule_id FROM enrollment_id_rules
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at ASC LIMIT 1`,
      [tenantId],
    );
    if (!rows[0]?.rule_id) {
      throw new BadRequestException(
        'No active enrollment/PRN rule configured. Create one in Super Admin settings first.',
      );
    }
    return rows[0].rule_id as string;
  }

  private async resolveDefaultEntityId(tenantId: string): Promise<number> {
    const rows = await this.dataSource.query(
      `SELECT entity_id FROM org_entities WHERE tenant_id = $1 AND is_active = true ORDER BY entity_id LIMIT 1`,
      [tenantId],
    );
    if (!rows[0]?.entity_id) {
      throw new BadRequestException(
        'No organization entity found for this tenant',
      );
    }
    return Number(rows[0].entity_id);
  }

  private generateTempPassword(): string {
    return randomBytes(4).toString('hex');
  }

  private async createStudentInPipeline(
    qr: QueryRunner,
    tenantId: string,
    entityId: number,
    row: StudentRowInput,
    enrollmentRuleId: string,
  ): Promise<{ user_id: string; email: string; temp_password: string }> {
    const email = row.email.toLowerCase();

    const existing = await qr.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND lower(official_email) = $2`,
      [tenantId, email],
    );
    if (existing[0]) {
      throw new BadRequestException(`Email already exists: ${email}`);
    }

    const roleRows = await qr.query(
      `SELECT role_id FROM roles WHERE lower(role_name) = 'student' LIMIT 1`,
    );
    const roleId = roleRows[0]?.role_id;
    if (!roleId) throw new BadRequestException('Student role not found');

    const prnResult = await this.masterData.generateEnrollmentId(
      tenantId,
      enrollmentRuleId,
      {
        BATCH: row.batch ?? 'GEN',
      },
    );
    const prn = prnResult.enrollment_id;

    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const onboardingStatus = getInitialOnboardingStatusForRole('Student');

    const userRows = await qr.query(
      `INSERT INTO users (tenant_id, name, official_email, role_id, password_hash, is_active, entity_id, phone, onboarding_status, onboarding_profile)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, '{}'::jsonb)
       RETURNING user_id`,
      [
        tenantId,
        row.name,
        email,
        roleId,
        passwordHash,
        entityId,
        row.phone ?? null,
        onboardingStatus,
      ],
    );
    const userId = userRows[0].user_id as string;

    await qr.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       VALUES ($1, $2, true)
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [userId, roleId],
    );

    const parentInfo = row.father_name ? { father_name: row.father_name } : {};

    await qr.query(
      `INSERT INTO student_profiles (tenant_id, user_id, prn_number, enrollment_no, batch, parent_info, phone, status)
       VALUES ($1, $2, $3, $3, $4, $5::jsonb, $6, 'ACTIVE')
       ON CONFLICT (user_id) DO UPDATE SET
         prn_number = EXCLUDED.prn_number,
         enrollment_no = EXCLUDED.enrollment_no,
         batch = EXCLUDED.batch,
         parent_info = EXCLUDED.parent_info,
         phone = EXCLUDED.phone`,
      [
        tenantId,
        userId,
        prn,
        row.batch ?? null,
        JSON.stringify(parentInfo),
        row.phone ?? null,
      ],
    );

    return { user_id: userId, email, temp_password: tempPassword };
  }
}
