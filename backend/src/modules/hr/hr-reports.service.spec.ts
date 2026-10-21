import * as ExcelJS from 'exceljs';
import { HrReportsService } from './hr-reports.service';

describe('HR report period selection and empty exports', () => {
  function setup(rows: unknown[] = []) {
    const query = jest.fn().mockResolvedValue(rows);
    const getMatrixMonth = jest.fn().mockResolvedValue({ employees: [] });
    const service = new HrReportsService(
      { query } as never,
      { entityFilterSql: () => ' AND p.entity_id = $2' } as never,
      { getMatrixMonth } as never,
    );
    return { service, query, getMatrixMonth };
  }

  it.each(['', '2026-00', '2026-13', '2026-1', '2026-10-junk', 'NaN'])('rejects invalid report month %s before querying', async (month) => {
    const { service, query, getMatrixMonth } = setup();
    await expect(service.buildMusterRoll('tenant', 7, month)).rejects.toThrow('YYYY-MM');
    await expect(service.buildPayrollRegister('tenant', 7, month)).rejects.toThrow('YYYY-MM');
    await expect(service.buildMissingPunchesReport('tenant', 7, month)).rejects.toThrow('YYYY-MM');
    expect(query).not.toHaveBeenCalled();
    expect(getMatrixMonth).not.toHaveBeenCalled();
  });

  it('uses the selected month in the attendance matrix and actual spreadsheet columns', async () => {
    const { service, getMatrixMonth } = setup();
    getMatrixMonth.mockResolvedValue({ employees: [{ user_id: 'staff-id', name: 'Employee', days: [{ date: '2024-02-29', calculated_status: 'FULL_DAY' }] }] });
    const bytes = await service.buildMusterRoll('tenant', 7, '2024-02');
    expect(getMatrixMonth).toHaveBeenCalledWith('tenant', '2024-02', 7);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    const sheet = workbook.worksheets[0];
    expect(sheet.getRow(1).cellCount).toBe(31); // ID, name, 29 days
    expect(sheet.getCell(2, 31).value).toBe('P');
  });

  it('keeps balance year and payroll month independent, including numeric legacy payroll months', async () => {
    const { service, query } = setup([{ name: 'Employee', employee_id: 'EMP1' }]);
    await service.buildLeaveBalanceRegister('tenant', 7, 2025);
    expect(query.mock.calls[0][1]).toEqual(['tenant', 7, 2025]);
    await service.buildPayrollRegister('tenant', 7, '2026-10');
    expect(query.mock.calls[1][1]).toEqual(['tenant', 7, 2026, ['october', 'oct', '10', '10', '2026-10']]);
    expect(query.mock.calls[1][0]).toContain('lower(trim(sp.month)) = ANY');
    expect(query.mock.calls[1][0]).toContain('p.entity_id = $2');
  });

  it('queries the whole selected month for missing punches, not just yesterday', async () => {
    const { service, query } = setup([{ name: 'Employee', attendance_date: '2024-02-29', first_in_time: '2024-02-29T09:00:00Z' }]);
    const bytes = await service.buildMissingPunchesReport('tenant', 7, '2024-02');
    expect(query.mock.calls[0][1]).toEqual(['tenant', 7, '2024-02-01', '2024-02-29']);
    expect(query.mock.calls[0][0]).toContain('t.date = y.date + 1');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as never);
    expect(workbook.worksheets[0].getCell(2, 3).value).toBe('2024-02-29');
  });

  it('returns an explicit no-data response instead of a misleading successful empty file', async () => {
    const { service } = setup();
    await expect(service.buildPayrollRegister('tenant', 7, '2026-10')).rejects.toThrow('No report data');
    await expect(service.buildMissingPunchesReport('tenant', 7, '2026-10')).rejects.toThrow('No report data');
    await expect(service.buildLeaveBalanceRegister('tenant', 7, 2026)).rejects.toThrow('No report data');
    await expect(service.buildMusterRoll('tenant', 7, '2026-10')).rejects.toThrow('No report data');
    await expect(service.buildEmployeeMasterDump('tenant', 7)).rejects.toThrow('No report data');
  });
});
