export type GradingComponentGroup =
  | 'ga'
  | 'weekly'
  | 'practical'
  | 'lab'
  | 'midterm'
  | 'endterm';

export type GradingComponent = {
  id: string;
  label: string;
  max: number;
  group: GradingComponentGroup;
  /** Auto-synced from weekly tests — not manually entered here. */
  readOnly: boolean;
  hint?: string;
};

const PE_COMPONENTS: GradingComponent[] = Array.from({ length: 10 }, (_, index) => ({
  id: `PE${index + 1}`,
  label: `PE${index + 1}`,
  max: 4,
  group: 'practical' as const,
  readOnly: false,
}));

const LAB_COMPONENTS: GradingComponent[] = [
  {
    id: 'PROJECT_TITLE',
    label: 'Project Title',
    max: 2,
    group: 'lab',
    readOnly: false,
  },
  {
    id: 'PROJECT_PRESENTATION_1',
    label: 'Project Presentation 1',
    max: 9,
    group: 'lab',
    readOnly: false,
  },
  {
    id: 'PROJECT_PRESENTATION_2',
    label: 'Project Presentation 2',
    max: 9,
    group: 'lab',
    readOnly: false,
  },
  { id: 'LAB_VIVA', label: 'Viva', max: 10, group: 'lab', readOnly: false },
  {
    id: 'MINOR_PRACTICAL',
    label: 'Minor Practical',
    max: 10,
    group: 'lab',
    readOnly: false,
  },
  {
    id: 'MAJOR_PRACTICAL',
    label: 'Major Practical',
    max: 20,
    group: 'lab',
    readOnly: false,
  },
];

/** Canonical column order: GA → WT → PE → lab → MTE → ETE */
export const GRADING_COMPONENT_CATALOG: GradingComponent[] = [
  { id: 'GA1', label: 'GA1', max: 5, group: 'ga', readOnly: false },
  { id: 'GA2', label: 'GA2', max: 5, group: 'ga', readOnly: false },
  {
    id: 'WT1',
    label: 'WT1',
    max: 5,
    group: 'weekly',
    readOnly: true,
    hint: 'Auto from weekly test',
  },
  {
    id: 'WT2',
    label: 'WT2',
    max: 5,
    group: 'weekly',
    readOnly: true,
    hint: 'Auto from weekly test',
  },
  ...PE_COMPONENTS,
  ...LAB_COMPONENTS,
  { id: 'MT1', label: 'MT1', max: 10, group: 'midterm', readOnly: false },
  { id: 'MT2', label: 'MT2', max: 10, group: 'midterm', readOnly: false },
  { id: 'ETE', label: 'ETE', max: 40, group: 'endterm', readOnly: false },
];

export const GRADING_COMPONENT_DISPLAY_ORDER = [
  ...GRADING_COMPONENT_CATALOG.map((component) => component.id),
  'MTE1',
  'MTE2',
];

export const GRADING_COMPONENT_MAP = new Map(
  GRADING_COMPONENT_CATALOG.map((component) => [component.id, component]),
);

export const GRADING_COMPONENT_GROUPS: Array<{
  id: GradingComponentGroup;
  label: string;
}> = [
  { id: 'ga', label: 'Graded assignments (GA)' },
  { id: 'weekly', label: 'Weekly tests (auto-synced)' },
  { id: 'practical', label: 'Practical evaluations (PE)' },
  { id: 'lab', label: 'Lab project components' },
  { id: 'midterm', label: 'Mid-term tests (MTE)' },
  { id: 'endterm', label: 'End-term (ETE)' },
];

const displayOrderMap = new Map(
  GRADING_COMPONENT_DISPLAY_ORDER.map((id, index) => [id, index]),
);

export function getGradingComponent(id: string): GradingComponent | undefined {
  return GRADING_COMPONENT_MAP.get(id);
}

export function sortComponentIds(ids: string[]): string[] {
  return [...ids].sort(
    (a, b) => (displayOrderMap.get(a) ?? 999) - (displayOrderMap.get(b) ?? 999),
  );
}

export function sortGradingComponents(components: GradingComponent[]): GradingComponent[] {
  return [...components].sort(
    (a, b) => (displayOrderMap.get(a.id) ?? 999) - (displayOrderMap.get(b.id) ?? 999),
  );
}

/** Legacy aliases still stored in older marks rows. */
export const LEGACY_EXAM_TYPE_ALIASES: Record<string, string> = {
  MTE1: 'MT1',
  MTE2: 'MT2',
};

export function normalizeExamType(examType: string): string {
  return LEGACY_EXAM_TYPE_ALIASES[examType] ?? examType;
}
