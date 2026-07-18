/** Smoke data for Result Insights — mirrors /api/academics/insights/academic-performance */

export type ResultInsightsData = {
  years: {
    year: number;
    midTerm: { red: number; yellow: number; green: number };
    endTerm: { AA: number; AB: number; BB: number; BC: number; CC: number; CD: number; DD: number; F: number };
  }[];
  summary: { excellenceRate: number; riskRate: number };
  comparative: {
    departmentWise: { department: string; avgCgpa: number; passRate: number }[];
    cohortProgression: { batch: string; avgCgpa: number }[];
  };
  outliers: { bottlenecks: { courseCode: string; courseName: string; failureRate: number }[] };
  correlative: {
    attendanceVsSgpa: { attendanceBand: string; avgCgpa: number }[];
    placementVsCgpa: { cgpaTier: string; offerRate: number }[];
  };
  demographic: {
    scholarshipRoi: { group: string; avgCgpa: number; retentionRate: number }[];
  };
};

export const RESULT_INSIGHTS_SMOKE_DATA: ResultInsightsData = {
  summary: {
    excellenceRate: 18,
    riskRate: 11,
  },
  years: [
    {
      year: 1,
      midTerm: { red: 142, yellow: 318, green: 1840 },
      endTerm: { AA: 186, AB: 412, BB: 698, BC: 524, CC: 312, CD: 98, DD: 42, F: 28 },
    },
    {
      year: 2,
      midTerm: { red: 98, yellow: 276, green: 1624 },
      endTerm: { AA: 164, AB: 388, BB: 612, BC: 498, CC: 286, CD: 84, DD: 38, F: 26 },
    },
    {
      year: 3,
      midTerm: { red: 76, yellow: 224, green: 1488 },
      endTerm: { AA: 198, AB: 426, BB: 584, BC: 462, CC: 248, CD: 72, DD: 34, F: 22 },
    },
    {
      year: 4,
      midTerm: { red: 54, yellow: 168, green: 1312 },
      endTerm: { AA: 224, AB: 468, BB: 556, BC: 418, CC: 212, CD: 58, DD: 28, F: 16 },
    },
  ],
  comparative: {
    departmentWise: [
      { department: 'Computer Science & Engineering', avgCgpa: 8.12, passRate: 94 },
      { department: 'Electronics & Communication', avgCgpa: 7.86, passRate: 92 },
      { department: 'Mechanical Engineering', avgCgpa: 7.24, passRate: 85 },
      { department: 'School of Management (MBA)', avgCgpa: 8.34, passRate: 96 },
      { department: 'School of Pharmacy', avgCgpa: 7.68, passRate: 88 },
      { department: 'Civil Engineering', avgCgpa: 6.92, passRate: 78 },
      { department: 'Electrical Engineering', avgCgpa: 7.18, passRate: 81 },
      { department: 'Applied Sciences', avgCgpa: 7.54, passRate: 87 },
    ],
    cohortProgression: [
      { batch: '2022', avgCgpa: 7.42 },
      { batch: '2023', avgCgpa: 7.58 },
      { batch: '2024', avgCgpa: 7.74 },
      { batch: '2025', avgCgpa: 7.86 },
      { batch: '2026', avgCgpa: 7.94 },
    ],
  },
  outliers: {
    bottlenecks: [
      { courseCode: 'MA201', courseName: 'Engineering Mathematics II', failureRate: 34.2 },
      { courseCode: 'PH102', courseName: 'Engineering Physics', failureRate: 28.6 },
      { courseCode: 'CS301', courseName: 'Data Structures & Algorithms', failureRate: 26.4 },
      { courseCode: 'EE204', courseName: 'Network Analysis', failureRate: 24.8 },
      { courseCode: 'ME205', courseName: 'Thermodynamics', failureRate: 22.1 },
    ],
  },
  correlative: {
    attendanceVsSgpa: [
      { attendanceBand: '<75%', avgCgpa: 6.42 },
      { attendanceBand: '75-85%', avgCgpa: 7.38 },
      { attendanceBand: '>85%', avgCgpa: 8.24 },
    ],
    placementVsCgpa: [
      { cgpaTier: '>8.5', offerRate: 92 },
      { cgpaTier: '6.5-8.5', offerRate: 68 },
      { cgpaTier: '<6.5', offerRate: 24 },
    ],
  },
  demographic: {
    scholarshipRoi: [
      { group: 'Institutional Scholarship', avgCgpa: 8.8, retentionRate: 95 },
      { group: 'General Population', avgCgpa: 7.4, retentionRate: 88 },
      { group: 'Govt. Sponsored', avgCgpa: 7.9, retentionRate: 91 },
    ],
  },
};

export function hasResultInsightsPayload(data: unknown): data is ResultInsightsData {
  if (!data || typeof data !== 'object') return false;
  const row = data as ResultInsightsData;
  return Boolean(row.years?.length && row.summary && row.comparative);
}

/** Live API often returns empty year shells (all zeros) with no departments — treat as unusable for demos. */
export function isMeaningfulResultInsights(data: ResultInsightsData): boolean {
  const deptCount = data.comparative?.departmentWise?.length ?? 0;
  const cohortCount = data.comparative?.cohortProgression?.length ?? 0;
  const gradeTotal = (data.years ?? []).reduce((sum, year) => {
    const end = year.endTerm ?? ({} as ResultInsightsData['years'][0]['endTerm']);
    return (
      sum +
      Object.values(end).reduce((inner, n) => inner + (Number(n) || 0), 0)
    );
  }, 0);
  const rates =
    Number(data.summary?.excellenceRate ?? 0) + Number(data.summary?.riskRate ?? 0);

  // Need real comparative context for the executive dashboard to be useful.
  return deptCount >= 2 && cohortCount >= 1 && (gradeTotal >= 20 || rates > 0);
}

