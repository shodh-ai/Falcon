import type { BunkMeter } from '@/types/academics';

const DEFAULT_CONDUCTED = 40;
const THRESHOLD = 75;

export function computeBunkMeter(
  attendancePercent: number,
  conducted = DEFAULT_CONDUCTED,
): BunkMeter {
  const percent = Math.min(100, Math.max(0, attendancePercent));
  const attended = Math.round((conducted * percent) / 100);
  const margin = Math.floor(attended / (THRESHOLD / 100) - conducted);

  let marginMessage: string;
  if (margin > 0) {
    marginMessage = `You can miss ${margin} more class${margin === 1 ? '' : 'es'} and stay above ${THRESHOLD}%.`;
  } else if (margin === 0) {
    marginMessage = `You're at the ${THRESHOLD}% threshold — don't miss any more classes.`;
  } else {
    const needed = Math.abs(margin);
    marginMessage = `Attend the next ${needed} class${needed === 1 ? '' : 'es'} to get back above ${THRESHOLD}%.`;
  }

  return { conducted, attended, percent, margin, marginMessage };
}
