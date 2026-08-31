import {
  ACQUISITION_WORKBOOK_MAX_BYTES,
  isAllowedAcquisitionWorkbook,
} from './acquisition.controller';

describe('AcquisitionController upload boundary', () => {
  it.each([
    ['legacy Excel', 'request.xls', 'application/vnd.ms-excel'],
    [
      'macro workbook',
      'request.xlsm',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
    ],
    ['renamed archive', 'request.xlsx', 'application/zip'],
    [
      'renamed macro workbook',
      'request.xlsx',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
    ],
  ])('rejects %s before parsing', (_label, originalname, mimetype) => {
    expect(isAllowedAcquisitionWorkbook({ originalname, mimetype })).toBe(
      false,
    );
  });

  it('accepts only the exact OOXML extension and MIME pair', () => {
    expect(
      isAllowedAcquisitionWorkbook({
        originalname: 'request.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).toBe(true);
  });

  it('keeps the upload boundary at exactly five mebibytes', () => {
    expect(ACQUISITION_WORKBOOK_MAX_BYTES).toBe(5_242_880);
  });
});
