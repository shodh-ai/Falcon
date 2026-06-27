export type ExecutivePeriod = 'today' | 'week' | 'semester' | 'year';

export type TrafficLightStatus = 'green' | 'yellow' | 'red';

export type RedFlag = {
  severity: 'red' | 'yellow';
  message: string;
  pillar: string;
  href: string;
};

export type PillarSummary = {
  id: string;
  title: string;
  href: string;
  status: TrafficLightStatus;
  kpis: Array<{ label: string; value: string }>;
};

export const EXECUTIVE_PERIOD_OPTIONS: Array<{ value: ExecutivePeriod; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'semester', label: 'This Semester' },
  { value: 'year', label: 'This Academic Year' },
];

export const TRAFFIC_LIGHT_STYLES: Record<
  TrafficLightStatus,
  { dot: string; border: string; bg: string }
> = {
  green: { dot: 'bg-emerald-500', border: 'border-emerald-200', bg: 'bg-emerald-50/50' },
  yellow: { dot: 'bg-amber-500', border: 'border-amber-200', bg: 'bg-amber-50/50' },
  red: { dot: 'bg-red-500', border: 'border-red-200', bg: 'bg-red-50/50' },
};
