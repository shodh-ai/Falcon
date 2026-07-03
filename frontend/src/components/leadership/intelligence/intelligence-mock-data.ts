/** Mock data for Executive Intelligence dashboard visual review */

export const MOCK_KPI = {
  revenueYtd: { value: 142000000, delta: 12, label: 'Total Revenue (YTD)' },
  expensesYtd: { value: 84000000, delta: -2, label: 'Total Expenses (YTD)' },
  netProfit: { value: 58000000, label: 'Net Profit' },
  liquidCash: { value: 120000000, label: 'Liquid Cash (Bank)' },
};

export const MOCK_CASH_FLOW = [
  { month: 'Jan', income: 1.8, expenses: 1.2 },
  { month: 'Feb', income: 2.1, expenses: 1.4 },
  { month: 'Mar', income: 2.4, expenses: 1.3 },
  { month: 'Apr', income: 2.0, expenses: 1.6 },
  { month: 'May', income: 2.6, expenses: 1.5 },
  { month: 'Jun', income: 2.9, expenses: 1.7 },
];

export const MOCK_REVENUE_SOURCES = [
  { name: 'Tuition', value: 82000000, color: '#08234a' },
  { name: 'Hostel', value: 34000000, color: '#64748b' },
  { name: 'Transport', value: 18000000, color: '#047857' },
  { name: 'Other', value: 8000000, color: '#d6b65d' },
];

export const MOCK_RECEIVABLES = {
  collected: 90000000,
  pending: 30000000,
  topDepartments: [
    { name: 'Engineering', due: 12000000 },
    { name: 'Management', due: 8500000 },
    { name: 'Pharmacy', due: 4200000 },
  ],
};

export const MOCK_DEPT_HEALTH = [
  { name: 'Marketing', utilization: 84 },
  { name: 'IT', utilization: 62 },
  { name: 'HR', utilization: 71 },
  { name: 'Operations', utilization: 55 },
  { name: 'Academics', utilization: 78 },
];

export const MOCK_FEED = [
  {
    event_id: 'mock-1',
    event_type: 'INCOME' as const,
    label: 'Student Fee Paid (Rahul - CSE)',
    amount: 120000,
    metadata: {},
    created_at: new Date(Date.now() - 8 * 60000).toISOString(),
  },
  {
    event_id: 'mock-2',
    event_type: 'EXPENSE' as const,
    label: 'Vendor Payout (Dell Computers)',
    amount: 75000,
    metadata: {},
    created_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    event_id: 'mock-3',
    event_type: 'INCOME' as const,
    label: 'Hostel Fee Received (Priya - MBA)',
    amount: 85000,
    metadata: {},
    created_at: new Date(Date.now() - 3 * 60000).toISOString(),
  },
  {
    event_id: 'mock-4',
    event_type: 'EXPENSE' as const,
    label: 'Electricity Bill (Campus Block A)',
    amount: 210000,
    metadata: {},
    created_at: new Date(Date.now() - 1 * 60000).toISOString(),
  },
  {
    event_id: 'mock-5',
    event_type: 'ALERT' as const,
    label: 'Marketing budget at 84% — threshold warning',
    amount: null,
    metadata: { severity: 'YELLOW' },
    created_at: new Date().toISOString(),
  },
];

export const MOCK_MORNING_BRIEFING =
  'Good Morning, Chairman. Yesterday, we collected ₹4.2 Lakhs in fees. However, the Marketing department is now at 84% of their budget. Would you like a breakdown of their expenses?';

export const SUGGESTED_PROMPTS = [
  { label: 'Predict Q3 Cashflow', query: 'Predict Q3 cash flow based on current trends' },
  { label: 'Why did expenses rise?', query: 'Why did expenses increase this month?' },
  { label: 'Identify Vendor Anomalies', query: 'Identify any vendor billing anomalies in the last 30 days' },
];

export function formatCr(value: number) {
  return `₹ ${(value / 10000000).toFixed(1)} Cr`;
}

export function formatLakhs(value: number) {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)} Lakhs`;
  return `₹${value.toLocaleString('en-IN')}`;
}
