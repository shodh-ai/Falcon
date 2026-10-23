import { postgresQueryRows } from './postgres-query-rows';

describe('PostgreSQL query rows', () => {
  it('returns actual PostgreSQL mutation rows without the affected count', () => {
    const rows = [{ id: 'one' }, { id: 'two' }];
    expect(postgresQueryRows([rows, 2])).toBe(rows);
  });

  it('treats a zero-row mutation tuple as empty', () => {
    expect(postgresQueryRows([[], 0])).toEqual([]);
  });

  it('preserves plain SELECT/INSERT row arrays, including zero rows', () => {
    const rows = [{ id: 'one' }, { id: 'two' }];
    expect(postgresQueryRows(rows)).toBe(rows);
    expect(postgresQueryRows([])).toEqual([]);
  });

  it.each([null, undefined, 0, {}])('handles missing row data %p', value => {
    expect(postgresQueryRows(value)).toEqual([]);
  });
});
