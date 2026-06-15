const IST = 'Asia/Kolkata';

export type TimetableSlotStatus = 'upcoming' | 'ongoing' | 'done';

/** Current clock time in Asia/Kolkata as minutes since midnight. */
export function getIstMinutesNow(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: IST,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** Parse "HH:MM" or "HH:MM:SS" into minutes since midnight. */
export function timeStringToMinutes(time: string): number {
  const normalized = time.includes('T') ? time.slice(11, 16) : time.slice(0, 5);
  const [hours, minutes = '0'] = normalized.split(':');
  const h = Number(hours);
  const m = Number(minutes);
  if (Number.isNaN(h) || Number.isNaN(m)) return Number.NaN;
  return h * 60 + m;
}

/**
 * Strict "Now" window: currentTime >= classStart && currentTime <= classEnd (IST).
 * At 12:02 with classes 11:00–11:55 and 14:00–14:55, nothing is "Now".
 */
export function getTimetableSlotStatus(
  start: string,
  end: string,
  nowMinutes = getIstMinutesNow(),
): TimetableSlotStatus {
  const startMinutes = timeStringToMinutes(start);
  const endMinutes = timeStringToMinutes(end);
  if (Number.isNaN(startMinutes) || Number.isNaN(endMinutes)) return 'upcoming';
  if (nowMinutes < startMinutes) return 'upcoming';
  if (nowMinutes > endMinutes) return 'done';
  if (nowMinutes >= startMinutes && nowMinutes <= endMinutes) return 'ongoing';
  return 'upcoming';
}

export function isVirtualRoom(room: string | null | undefined): boolean {
  if (!room) return false;
  return /zoom|meet|online|virtual|teams|webex|google|hangout|vtop-virtual/i.test(room);
}
