export type GradingComponent = {
  id: string;

  label: string;

  max: number;

  readOnly: boolean;
};

/** Canonical order: GA → WT → PE → lab → MTE → ETE */

export const GRADING_COMPONENT_CATALOG: GradingComponent[] = [
  { id: 'GA1', label: 'GA1', max: 5, readOnly: false },

  { id: 'GA2', label: 'GA2', max: 5, readOnly: false },

  { id: 'WT1', label: 'WT1', max: 5, readOnly: true },

  { id: 'WT2', label: 'WT2', max: 5, readOnly: true },

  ...Array.from({ length: 10 }, (_, index) => ({
    id: `PE${index + 1}`,

    label: `PE${index + 1}`,

    max: 4,

    readOnly: false,
  })),

  { id: 'PROJECT_TITLE', label: 'Project Title', max: 2, readOnly: false },

  {
    id: 'PROJECT_PRESENTATION_1',

    label: 'Project Presentation 1',

    max: 9,

    readOnly: false,
  },

  {
    id: 'PROJECT_PRESENTATION_2',

    label: 'Project Presentation 2',

    max: 9,

    readOnly: false,
  },

  { id: 'LAB_VIVA', label: 'Viva', max: 10, readOnly: false },

  {
    id: 'PRODUCT_VIVA',
    label: 'Semester-End Product Viva',
    max: 40,
    readOnly: false,
  },

  { id: 'MINOR_PRACTICAL', label: 'Minor Practical', max: 10, readOnly: false },

  { id: 'MAJOR_PRACTICAL', label: 'Major Practical', max: 20, readOnly: false },

  { id: 'MT1', label: 'MT1', max: 10, readOnly: false },

  { id: 'MT2', label: 'MT2', max: 10, readOnly: false },

  { id: 'ETE', label: 'ETE', max: 40, readOnly: false },

  // Legacy aliases kept for existing rows

  { id: 'MTE1', label: 'MTE1', max: 15, readOnly: false },

  { id: 'MTE2', label: 'MTE2', max: 15, readOnly: false },
];

export const GRADING_COMPONENT_IDS = GRADING_COMPONENT_CATALOG.map((c) => c.id);

const catalogMap = new Map(GRADING_COMPONENT_CATALOG.map((c) => [c.id, c]));

export function getGradingComponent(
  examType: string,
): GradingComponent | undefined {
  return catalogMap.get(examType);
}

export function getGradingComponentMax(examType: string): number | null {
  return catalogMap.get(examType)?.max ?? null;
}

export function isAutoSyncedExamType(examType: string): boolean {
  return examType === 'WT1' || examType === 'WT2';
}

export function normalizeExamTypeForSave(examType: string): string {
  if (examType === 'MTE1') return 'MT1';
  if (examType === 'MTE2') return 'MT2';
  return examType;
}

export function isFacultyDirectGradingType(examType: string): boolean {
  return getGradingComponent(normalizeExamTypeForSave(examType)) !== undefined;
}

export function isKnownExamType(examType: string): boolean {
  const normalized = normalizeExamTypeForSave(examType);
  return (
    isFacultyDirectGradingType(normalized) ||
    normalized === 'QUIZ' ||
    [
      'CAT1',
      'CAT2',
      'END_TERM',
      'INTERNAL',
      'ASSIGNMENT',
      'DA1',
      'DA2',
    ].includes(normalized)
  );
}
