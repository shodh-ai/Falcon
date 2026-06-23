export type LiveClassRow = {
  live_class_id: string;
  course_id: string;
  title: string;
  meeting_url: string;
  starts_at: string;
  ends_at: string;
  created_at?: string;
  course_code?: string;
  course_name?: string;
};

export type LiveClassStatus = 'live' | 'upcoming' | 'ended';

export function getLiveClassStatus(startsAt: string, endsAt: string): LiveClassStatus {
  const now = Date.now();
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (now >= start && now <= end) return 'live';
  if (now < start) return 'upcoming';
  return 'ended';
}

export function canJoinLiveClass(startsAt: string, endsAt: string): boolean {
  const status = getLiveClassStatus(startsAt, endsAt);
  if (status === 'live') return true;
  if (status === 'upcoming') {
    const minutesUntil = (new Date(startsAt).getTime() - Date.now()) / 60_000;
    return minutesUntil <= 15;
  }
  return false;
}

export function formatLiveClassWhen(startsAt: string): string {
  return new Date(startsAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export const LIVE_CLASS_STATUS_LABEL: Record<LiveClassStatus, string> = {
  live: 'Live now',
  upcoming: 'Upcoming',
  ended: 'Ended',
};
