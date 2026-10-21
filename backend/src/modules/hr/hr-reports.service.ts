import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  private monthRange(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900) {
      throw new BadRequestException('Report month must be YYYY-MM');
    }
    const [year, monthNum] = month.split('-').map(Number);
    const days = new Date(year, monthNum, 0).getDate();
    return { year, monthNum, start: `${month}-01`, end: `${month}-${days}` };
  }

  private requireRows(rows: unknown[], period: string) {
    if (!rows.length) throw new NotFoundException(`No report data is available for ${period}. No file was generated.`);
  }

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
    this.monthRange(month);
    const matrix = await this.attendanceCalc.getMatrixMonth(
      tenantId,
      month,
      entityId,
    );
    this.requireRows(matrix.employees, month);
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
    this.monthRange(month);
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
    if (!Number.isInteger(year) || year < 1900 || year > 9999) {
      throw new BadRequestException('Balance year must be a four-digit year');
    }
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
       HAVING COUNT(b.user_id) > 0
       ORDER BY u.name`,
      [tenantId, entityId, year],
    );
    this.requireRows(rows, String(year));

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
    const { year, monthNum } = this.monthRange(month);
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);
    const rows = await this.dataSource.query(
      `SELECT u.name, p.employee_id, sp.gross_pay, sp.net_pay, sp.lwp_days,
              sp.working_days, sp.month, sp.year
       FROM staff_payslips sp
       JOIN users u ON u.user_id = sp.staff_user_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = sp.tenant_id
       WHERE sp.tenant_id = $1 AND sp.year = $3 AND lower(trim(sp.month)) = ANY($4::text[])${entityFilter}`,
      [tenantId, entityId, year, [this.monthLabel(monthNum).toLowerCase(), this.monthLabel(monthNum).slice(0, 3).toLowerCase(), String(monthNum), String(monthNum).padStart(2, '0'), month]],
    );
    this.requireRows(rows, month);

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
    month = new Date().toISOString().slice(0, 7),
  ): Promise<Buffer> {
    const { start, end } = this.monthRange(month);
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);

    const rows = await this.dataSource.query(
      `SELECT u.name, p.employee_id, y.date::text AS attendance_date, y.first_in_time, y.last_out_time, t.first_in_time AS next_day_in
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       JOIN hr_daily_attendance y ON y.user_id = u.user_id AND y.date BETWEEN $3::date AND $4::date
       JOIN hr_daily_attendance t ON t.user_id = u.user_id AND t.date = y.date + 1
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}
         AND y.first_in_time IS NOT NULL AND y.last_out_time IS NULL
         AND t.first_in_time IS NOT NULL
       ORDER BY u.name, y.date`,
      [tenantId, entityId, start, end],
    );
    this.requireRows(rows, month);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Missing Punches');
    sheet.addRow([
      'Employee ID',
      'Name',
      'Attendance date',
      'IN',
      'OUT',
      'Next day IN',
    ]);
    sheet.getRow(1).font = { bold: true };
    for (const r of rows) {
      sheet.addRow([
        r.employee_id,
        r.name,
        r.attendance_date,
        r.first_in_time
          ? new Date(r.first_in_time).toLocaleString('en-IN')
          : '',
        r.last_out_time
          ? new Date(r.last_out_time).toLocaleString('en-IN')
          : 'MISSING',
        r.next_day_in ? new Date(r.next_day_in).toLocaleString('en-IN') : '',
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
    this.requireRows(rows, 'the selected organization');

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
