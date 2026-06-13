/** Mock FP&A data for visual review before live API wiring */

export const MOCK_UNIVERSITY_BUDGET = 1000000000; // ₹100 Cr
export const MOCK_FINANCIAL_YEAR = '2026-2027';

export const MOCK_DEPARTMENTS = [
  { dept_id: 1, dept_name: 'Engineering', allocated_amount: 500000000, color: '#3b82f6' },
  { dept_id: 2, dept_name: 'Law', allocated_amount: 80000000, color: '#8b5cf6' },
  { dept_id: 3, dept_name: 'Management', allocated_amount: 120000000, color: '#06b6d4' },
  { dept_id: 4, dept_name: 'HR', allocated_amount: 60000000, color: '#f59e0b' },
  { dept_id: 5, dept_name: 'Operations', allocated_amount: 150000000, color: '#10b981' },
  { dept_id: 6, dept_name: 'Marketing', allocated_amount: 90000000, color: '#ec4899' },
];

export const MOCK_PROGRAMS: Record<number, Array<{ program_id: string; program_name: string; allocated_amount: number; utilized_amount: number }>> = {
  6: [
    { program_id: 'p-mkt-1', program_name: 'Annual Brand Campaign', allocated_amount: 50000000, utilized_amount: 42000000 },
    { program_id: 'p-mkt-2', program_name: 'Convocation Ceremony 2026', allocated_amount: 15000000, utilized_amount: 12000000 },
    { program_id: 'p-mkt-3', program_name: 'General Ops', allocated_amount: 25000000, utilized_amount: 18000000 },
  ],
  1: [
    { program_id: 'p-eng-1', program_name: 'Salaries', allocated_amount: 300000000, utilized_amount: 280000000 },
    { program_id: 'p-eng-2', program_name: 'Lab Equipment', allocated_amount: 150000000, utilized_amount: 120000000 },
    { program_id: 'p-eng-3', program_name: 'TechFest 2026', allocated_amount: 50000000, utilized_amount: 48000000 },
  ],
};

export const MOCK_TECHFEST_BREAKDOWN = [
  { category: 'Guest Speakers', amount: 10000000 },
  { category: 'Stage Setup', amount: 20000000 },
  { category: 'Catering', amount: 18000000 },
];

export const MOCK_CATERING_EXPENSES = [
  {
    expense_id: 'e-1',
    description: 'Invoice #4921 - Sharma Caterers',
    amount: 1800000,
    expense_date: '2026-06-01',
    vendor_name: 'Sharma Caterers',
    approved_by_name: 'HOD Engineering',
    category: 'Catering',
  },
  {
    expense_id: 'e-2',
    description: 'Invoice #4890 - Sharma Caterers (Advance)',
    amount: 500000,
    expense_date: '2026-05-15',
    vendor_name: 'Sharma Caterers',
    approved_by_name: 'HOD Engineering',
    category: 'Catering',
  },
];

export const MOCK_MONITOR_DEPTS = [
  { budget_id: 'b-eng', department_id: 1, department_name: 'Engineering', allocated_amount: 500000000, utilized_amount: 400000000, encumbered_amount: 20000000, utilization_percent: 84 },
  { budget_id: 'b-mkt', department_id: 6, department_name: 'Marketing', allocated_amount: 90000000, utilized_amount: 65000000, encumbered_amount: 10600000, utilization_percent: 84 },
  { budget_id: 'b-ops', department_id: 5, department_name: 'Operations', allocated_amount: 150000000, utilized_amount: 90000000, encumbered_amount: 15000000, utilization_percent: 70 },
  { budget_id: 'b-mgmt', department_id: 3, department_name: 'Management', allocated_amount: 120000000, utilized_amount: 72000000, encumbered_amount: 8000000, utilization_percent: 67 },
  { budget_id: 'b-law', department_id: 2, department_name: 'Law', allocated_amount: 80000000, utilized_amount: 45000000, encumbered_amount: 5000000, utilization_percent: 63 },
  { budget_id: 'b-hr', department_id: 4, department_name: 'HR', allocated_amount: 60000000, utilized_amount: 32000000, encumbered_amount: 4000000, utilization_percent: 60 },
];

export function formatCr(value: number) {
  return `₹${(value / 10000000).toFixed(2)} Cr`;
}

export function formatL(value: number) {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2)} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)} L`;
  return `₹${value.toLocaleString('en-IN')}`;
}

export function buildMockSankey() {
  const nodes = [
    { name: 'University Budget' },
    { name: 'Engineering' },
    { name: 'Marketing' },
    { name: 'Operations' },
    { name: 'Management' },
    { name: 'Law' },
    { name: 'HR' },
    { name: 'TechFest 2026' },
    { name: 'Salaries' },
    { name: 'Brand Campaign' },
    { name: 'Catering (Spent)' },
    { name: 'Vendors' },
  ];
  const links = [
    { source: 'University Budget', target: 'Engineering', value: 50 },
    { source: 'University Budget', target: 'Marketing', value: 9 },
    { source: 'University Budget', target: 'Operations', value: 15 },
    { source: 'University Budget', target: 'Management', value: 12 },
    { source: 'University Budget', target: 'Law', value: 8 },
    { source: 'University Budget', target: 'HR', value: 6 },
    { source: 'Engineering', target: 'TechFest 2026', value: 5 },
    { source: 'Engineering', target: 'Salaries', value: 30 },
    { source: 'Marketing', target: 'Brand Campaign', value: 5 },
    { source: 'TechFest 2026', target: 'Catering (Spent)', value: 1.8 },
    { source: 'Catering (Spent)', target: 'Vendors', value: 1.8 },
  ];
  return { nodes, links };
}
