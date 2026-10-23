import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

describe('weekly-test spreadsheet import compatibility', () => {
  it('reads CSV question numbers and answer options without shifting empty cells', () => {
    const workbook = XLSX.read(
      'Question,Notes,Answer\r\nQ1,,A\r\n2,,b\r\n10,"Keep, this note",D\r\n',
      { type: 'binary' },
    );
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

    expect(rows[0]).toEqual(['Question', 'Notes', 'Answer']);
    expect(rows[1][0]).toBe('Q1');
    expect(rows[1][1]).toBeUndefined();
    expect(rows[1][2]).toBe('A');
    expect(rows[2][0]).toBe(2);
    expect(rows[2][2]).toBe('b');
    expect(rows[3]).toEqual([10, 'Keep, this note', 'D']);
  });

  it('reads a binary XLSX answer key with empty rows and multiple worksheets', () => {
    const source = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      source,
      XLSX.utils.aoa_to_sheet([
        ['Question', 'Notes', 'Answer'],
        [1, undefined, 'A'],
        [],
        ['Q10', undefined, 'D'],
      ]),
      'Answer key',
    );
    XLSX.utils.book_append_sheet(
      source,
      XLSX.utils.aoa_to_sheet([['Instructions', 'Choose A, B, C, or D']]),
      'Instructions',
    );
    const binary: string = XLSX.write(source, { bookType: 'xlsx', type: 'binary' });
    const workbook = XLSX.read(binary, { type: 'binary' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });

    expect(workbook.SheetNames).toEqual(['Answer key', 'Instructions']);
    expect(rows).toHaveLength(4);
    expect(rows[1][0]).toBe(1);
    expect(rows[1][1]).toBeUndefined();
    expect(rows[1][2]).toBe('A');
    expect(rows[2]).toEqual([]);
    expect(rows[3][0]).toBe('Q10');
    expect(rows[3][1]).toBeUndefined();
    expect(rows[3][2]).toBe('D');
  });
});
