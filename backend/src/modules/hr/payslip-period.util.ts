import { BadRequestException } from '@nestjs/common';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function monthNameToNumber(month: string): number {
  const normalized = month.trim().toLowerCase();
  const exact = MONTH_NAMES.findIndex((m) => m.toLowerCase() === normalized);
  if (exact >= 0) return exact + 1;
  const prefix = MONTH_NAMES.findIndex((m) =>
    m.toLowerCase().startsWith(normalized.slice(0, 3)),
  );
  if (prefix >= 0) return prefix + 1;
  return 0;
}

export function monthNumberToName(month: number): string {
  return MONTH_NAMES[month - 1] ?? `Month-${month}`;
}

export function parseYearMonthKey(key: string): {
  year: number;
  month: number;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(key?.trim() ?? '');
  if (!match) {
    throw new BadRequestException('Month must be in YYYY-MM format.');
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) {
    throw new BadRequestException('Invalid month range.');
  }
  return { year, month };
}

export function toYearMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function payslipToYearMonthKey(
  monthName: string,
  year: number,
): string | null {
  const month = monthNameToNumber(monthName);
  if (!month) return null;
  return toYearMonthKey(year, month);
}

export function compareYearMonthKeys(a: string, b: string): number {
  const ka = parseYearMonthKey(a);
  const kb = parseYearMonthKey(b);
  return ka.year * 12 + ka.month - (kb.year * 12 + kb.month);
}

export function enumerateYearMonthKeys(from: string, to: string): string[] {
  if (compareYearMonthKeys(from, to) > 0) {
    throw new BadRequestException(
      'Start month must be before or equal to end month.',
    );
  }
  const start = parseYearMonthKey(from);
  const end = parseYearMonthKey(to);
  const keys: string[] = [];
  let y = start.year;
  let m = start.month;
  while (y < end.year || (y === end.year && m <= end.month)) {
    keys.push(toYearMonthKey(y, m));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

export function formatPeriodLabel(key: string): string {
  const { year, month } = parseYearMonthKey(key);
  return `${monthNumberToName(month).slice(0, 3)} ${year}`;
}
