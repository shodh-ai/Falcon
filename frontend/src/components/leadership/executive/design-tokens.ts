/** Executive / Chairman portal design tokens — premium light terminal aesthetic */

export const EXECUTIVE_SPACING = {
  page: 'space-y-8',
  card: 'p-6 md:p-8',
  cardGap: 'gap-6',
  section: 'space-y-6',
} as const;

export const EXECUTIVE_CARD =
  'rounded-[1.5rem] border border-sgvu-navy/10 bg-white shadow-[0_8px_30px_rgba(8,35,74,0.06)]';

export const EXECUTIVE_TYPO = {
  heroKpi: 'font-mono text-4xl font-black tabular-nums tracking-tight text-sgvu-navy md:text-5xl',
  heroKpiAlert: 'font-mono text-4xl font-black tabular-nums tracking-tight md:text-5xl',
  cardTitle: 'text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground',
  sectionTitle: 'text-sm font-bold uppercase tracking-[0.18em] text-sgvu-navy',
  bodySecondary: 'text-sm text-muted-foreground',
  eyebrow: 'text-xs font-bold uppercase tracking-[0.22em] text-sgvu-gold',
} as const;

export const EXECUTIVE_CHART_COLORS = {
  navy: '#08234a',
  slate: '#64748b',
  slateLight: '#94a3b8',
  green: '#047857',
  greenLight: '#059669',
  gold: '#d6b65d',
  muted: '#cbd5e1',
} as const;

/** Ordered palette for multi-series charts — muted, no neon */
export const EXECUTIVE_CHART_SERIES = [
  EXECUTIVE_CHART_COLORS.navy,
  EXECUTIVE_CHART_COLORS.slate,
  EXECUTIVE_CHART_COLORS.green,
  EXECUTIVE_CHART_COLORS.gold,
  EXECUTIVE_CHART_COLORS.slateLight,
  EXECUTIVE_CHART_COLORS.greenLight,
] as const;

export const EXECUTIVE_CHART_TOOLTIP = {
  borderRadius: '12px',
  border: '1px solid #e2e8f0',
  boxShadow: '0 8px 30px rgba(8,35,74,0.08)',
  background: '#ffffff',
} as const;
