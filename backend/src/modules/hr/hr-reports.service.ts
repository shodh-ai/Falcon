import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { HrEntityContextService } from './hr-entity-context.service';
import { AttendanceCalculationService } from './attendance-calculation.service';

@Injectable()
export class HrReportsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly entityCtx: HrEntityContextService,
    private readonly attendanceCalc: AttendanceCalculationService,
  ) {}

  private statusCode(calculated: string | null | undefined): string {
    if (!calculated) return 'A';
    if (
      calculated === 'FULL_DAY' ||
      calculated === 'LATE_COMING' ||
      calculated === 'EARLY_GOING'
    )
      return 'P';
    if (calculated === 'HALF_DAY' || calculated === 'LESS_THAN_HALF_DAY')
      return 'HD';
    if (
      calculated === 'HOLIDAY' ||
      calculated === 'WEEK_OFF' ||
      calculated === 'RESTRICTED_HOLIDAY'
    )
      return 'H';
    if (calculated === 'PENDING_REQUEST') return 'L';
    return 'A';
  }

  async buildMusterRoll(
    tenantId: string,
    entityId: number,
    month: string,
  ): Promise<Buffer> {
    const matrix = await this.attendanceCalc.getMatrixMonth(
      tenantId,
      month,
      entityId,
    );
    const [, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(
      month.split('-').map(Number)[0],
      monthNum,
      0,
    ).getDate();

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Muster Roll');
    const headers = [
      'Employee ID',
      'Name',
      ...Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };

    for (const emp of matrix.employees) {
      const dayMap = new Map(
        emp.days.map((d) => [
          d.date.slice(8, 10),
          this.statusCode(d.calculated_status),
        ]),
      );
      const row = [
        emp.user_id.slice(0, 8),
        emp.name,
        ...Array.from(
          { length: daysInMonth },
          (_, i) => dayMap.get(String(i + 1).padStart(2, '0')) ?? 'A',
        ),
      ];
      sheet.addRow(row);
    }

    sheet.columns.forEach((col) => {
      col.width = 12;
    });
    sheet.getColumn(2).width = 28;

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildEmployeeAttendance(
    tenantId: string,
    entityId: number,
    month: string,
    userId: string,
  ): Promise<Buffer> {
    const matrix = await this.attendanceCalc.getMatrixMonth(
      tenantId,
      month,
      entityId,
    );
    const emp = matrix.employees.find((e) => e.user_id === userId);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Attendance');
    if (!emp) {
      sheet.addRow(['No data found for employee']);
      const buf = await wb.xlsx.writeBuffer();
      return Buffer.from(buf);
    }

    sheet.addRow(['Employee ID', emp.user_id]);
    sheet.addRow(['Name', emp.name]);
    sheet.addRow(['Month', month]);
    sheet.addRow([]);

    sheet.addRow(['Date', 'Status', 'Details']);
    sheet.getRow(5).font = { bold: true };

    for (const day of emp.days) {
      sheet.addRow([
        day.date,
        this.statusCode(day.calculated_status),
        day.tooltip || '',
      ]);
    }

    sheet.getColumn(1).width = 15;
    sheet.getColumn(2).width = 10;
    sheet.getColumn(3).width = 40;

    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildLeaveBalanceRegister(
    tenantId: string,
    entityId: number,
    year: number,
  ): Promise<Buffer> {
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);
    const rows = await this.dataSource.query(
      `SELECT u.name, p.employee_id,
              MAX(CASE WHEN b.leave_type = 'CL' THEN b.entitled - b.used END) AS cl_balance,
              MAX(CASE WHEN b.leave_type = 'SL' THEN b.entitled - b.used END) AS sl_balance,
              MAX(CASE WHEN b.leave_type = 'EL' THEN b.entitled - b.used END) AS el_balance
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       LEFT JOIN hr_leave_balances b ON b.user_id = u.user_id AND b.year = $3
       WHERE u.tenant_id = $1 AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}
       GROUP BY u.name, p.employee_id
       ORDER BY u.name`,
      [tenantId, entityId, year],
    );

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Leave Balances');
    sheet.addRow([
      'Employee ID',
      'Name',
      'CL Balance',
      'SL Balance',
      'EL Balance',
    ]);
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      sheet.addRow([
        r.employee_id,
        r.name,
        r.cl_balance,
        r.sl_balance,
        r.el_balance,
      ]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildPayrollRegister(
    tenantId: string,
    entityId: number,
    month: string,
  ): Promise<Buffer> {
    const [year, monthNum] = month.split('-').map(Number);
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);
    const rows = await this.dataSource.query(
      `SELECT u.name, p.employee_id, sp.gross_pay, sp.net_pay, sp.lwp_days,
              sp.working_days, sp.month, sp.year
       FROM staff_payslips sp
       JOIN users u ON u.user_id = sp.staff_user_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = sp.tenant_id
       WHERE sp.tenant_id = $1 AND sp.year = $3 AND sp.month ILIKE $4${entityFilter}`,
      [tenantId, entityId, year, `%${this.monthLabel(monthNum)}%`],
    );

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Salary Register');
    sheet.addRow([
      'Employee ID',
      'Name',
      'Base/Gross Pay',
      'Deductions (est.)',
      'Net Pay',
      'LWP Days',
      'Working Days',
    ]);
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      const gross = Number(r.gross_pay ?? 0);
      const net = Number(r.net_pay ?? 0);
      sheet.addRow([
        r.employee_id,
        r.name,
        gross,
        gross - net,
        net,
        r.lwp_days,
        r.working_days,
      ]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildMissingPunchesReport(
    tenantId: string,
    entityId: number,
  ): Promise<Buffer> {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);

    const rows = await this.dataSource.query(
      `SELECT u.name, p.employee_id, y.first_in_time, y.last_out_time, t.first_in_time AS today_in
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       JOIN hr_daily_attendance y ON y.user_id = u.user_id AND y.date = $3::date
       JOIN hr_daily_attendance t ON t.user_id = u.user_id AND t.date = $4::date
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}
         AND y.first_in_time IS NOT NULL AND y.last_out_time IS NULL
         AND t.first_in_time IS NOT NULL
       ORDER BY u.name`,
      [tenantId, entityId, yesterdayStr, today],
    );

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Missing Punches');
    sheet.addRow([
      'Employee ID',
      'Name',
      'Yesterday IN',
      'Yesterday OUT',
      'Today IN',
    ]);
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      sheet.addRow([
        r.employee_id,
        r.name,
        r.first_in_time
          ? new Date(r.first_in_time).toLocaleString('en-IN')
          : '',
        r.last_out_time
          ? new Date(r.last_out_time).toLocaleString('en-IN')
          : 'MISSING',
        r.today_in ? new Date(r.today_in).toLocaleString('en-IN') : '',
      ]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async buildEmployeeMasterDump(
    tenantId: string,
    entityId: number,
  ): Promise<Buffer> {
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);
    const rows = await this.dataSource.query(
      `SELECT u.name, u.official_email AS email, r.role_name AS role, d.dept_name AS department,
              p.employee_id, p.designation, p.joining_date,
              CASE WHEN p.pan_encrypted IS NOT NULL AND length(p.pan_encrypted) > 0 THEN 'ENCRYPTED' ELSE 'MISSING' END AS pan_status,
              CASE WHEN p.aadhaar_encrypted IS NOT NULL AND length(p.aadhaar_encrypted) > 0 THEN 'ENCRYPTED' ELSE 'MISSING' END AS aadhaar_status
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}
       ORDER BY u.name`,
      [tenantId, entityId],
    );

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Employee Master');
    sheet.addRow([
      'Employee ID',
      'Name',
      'Email',
      'Role',
      'Department',
      'Designation',
      'Joining Date',
      'PAN Status',
      'Aadhaar Status',
    ]);
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      sheet.addRow([
        r.employee_id,
        r.name,
        r.email,
        r.role,
        r.department,
        r.designation,
        r.joining_date,
        r.pan_status,
        r.aadhaar_status,
      ]);
    }
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  private monthLabel(month: number): string {
    return new Date(2000, month - 1, 1).toLocaleString('en-US', {
      month: 'long',
    });
  }
}
