import {
  isAllowedProcurementWorkbook,
  PROCUREMENT_WORKBOOK_MAX_BYTES,
} from './procurement.controller';

const MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

describe('Module 2 workbook upload boundary', () => {
  it('accepts only exact xlsx extension and OOXML MIME', () => {
    expect(
      isAllowedProcurementWorkbook({
        originalname: 'procurement.xlsx',
        mimetype: MIME,
      }),
    ).toBe(true);
    expect(
      isAllowedProcurementWorkbook({
        originalname: 'procurement.xlsm',
        mimetype: MIME,
      }),
    ).toBe(false);
    expect(
      isAllowedProcurementWorkbook({
        originalname: 'procurement.xlsx',
        mimetype: 'application/zip',
      }),
    ).toBe(false);
  });

  it('enforces the five MiB boundary', () => {
    expect(PROCUREMENT_WORKBOOK_MAX_BYTES).toBe(5 * 1024 * 1024);
  });
});
