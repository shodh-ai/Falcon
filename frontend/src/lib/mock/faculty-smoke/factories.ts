/**
 * Reusable seeded factories for Faculty Portal smoke / QA data.
 * Deterministic: same seed ⇒ same output across reloads.
 */

export type SeededRng = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  pickN: <T>(items: readonly T[], n: number) => T[];
  bool: (p?: number) => boolean;
  percent: (min: number, max: number, decimals?: number) => number;
  shuffle: <T>(items: readonly T[]) => T[];
};

export function createSeededRng(seed = 42_021): SeededRng {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  const pick = <T,>(items: readonly T[]) => items[int(0, items.length - 1)]!;
  const shuffle = <T,>(items: readonly T[]) => {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = int(0, i);
      [arr[i], arr[j]] = [arr[j]!, arr[i]!];
    }
    return arr;
  };
  return {
    next,
    int,
    pick,
    pickN: (items, n) => shuffle(items).slice(0, Math.min(n, items.length)),
    bool: (p = 0.5) => next() < p,
    percent: (min, max, decimals = 1) => {
      const v = min + next() * (max - min);
      const f = 10 ** decimals;
      return Math.round(v * f) / f;
    },
    shuffle,
  };
}

export const FIRST_NAMES_M = [
  'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Shaurya',
  'Kabir', 'Atharv', 'Dhruv', 'Rohan', 'Kunal', 'Nikhil', 'Rahul', 'Aman', 'Yash', 'Harsh',
  'Siddharth', 'Ankit', 'Pranav', 'Varun', 'Abhinav', 'Karthik', 'Manish', 'Suresh', 'Ravi', 'Deepak',
] as const;

export const FIRST_NAMES_F = [
  'Aadhya', 'Ananya', 'Diya', 'Myra', 'Sara', 'Ira', 'Anika', 'Navya', 'Kiara', 'Pari',
  'Isha', 'Riya', 'Sneha', 'Pooja', 'Neha', 'Priya', 'Kavya', 'Meera', 'Shreya', 'Tanvi',
  'Nisha', 'Divya', 'Anjali', 'Lakshmi', 'Swati', 'Pallavi', 'Ritika', 'Aditi', 'Sanjana', 'Aishwarya',
] as const;

export const LAST_NAMES = [
  'Sharma', 'Verma', 'Patel', 'Singh', 'Gupta', 'Reddy', 'Nair', 'Iyer', 'Joshi', 'Mehta',
  'Khan', 'Das', 'Banerjee', 'Choudhary', 'Malhotra', 'Kapoor', 'Agarwal', 'Jain', 'Rao', 'Pillai',
  'Desai', 'Kulkarni', 'Pandey', 'Mishra', 'Saxena', 'Bhat', 'Trivedi', 'Ghosh', 'Menon', 'Shetty',
] as const;

export const DEPARTMENTS = [
  { code: 'CSE', name: 'Computer Science' },
  { code: 'AIDS', name: 'AI & DS' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'ME', name: 'Mechanical' },
  { code: 'CE', name: 'Civil' },
  { code: 'EE', name: 'Electrical' },
  { code: 'MBA', name: 'MBA' },
  { code: 'BBA', name: 'BBA' },
  { code: 'BCA', name: 'BCA' },
  { code: 'MCA', name: 'MCA' },
] as const;

export const PROGRAMS = [
  'B.Tech CSE',
  'B.Tech AI & DS',
  'B.Tech IT',
  'B.Tech Mechanical',
  'B.Tech Civil',
  'B.Tech Electrical',
  'MBA',
  'BBA',
  'BCA',
  'MCA',
] as const;

export const SECTIONS = ['A', 'B', 'C', 'D'] as const;
export const BATCHES = ['2022-26', '2023-27', '2024-28', '2025-29'] as const;

export const COURSE_CATALOG: Array<{
  code: string;
  name: string;
  credits: number;
  department: string;
  semester: number;
}> = [
  { code: 'CSE301', name: 'Data Structures & Algorithms', credits: 4, department: 'Computer Science', semester: 3 },
  { code: 'CSE302', name: 'Database Management Systems', credits: 4, department: 'Computer Science', semester: 4 },
  { code: 'CSE401', name: 'Operating Systems', credits: 3, department: 'Computer Science', semester: 5 },
  { code: 'CSE402', name: 'Computer Networks', credits: 3, department: 'Computer Science', semester: 5 },
  { code: 'CSE403', name: 'Software Engineering', credits: 3, department: 'Computer Science', semester: 5 },
  { code: 'CSE501', name: 'Machine Learning', credits: 4, department: 'Computer Science', semester: 6 },
  { code: 'CSE502', name: 'Cloud Computing', credits: 3, department: 'Computer Science', semester: 6 },
  { code: 'AID301', name: 'Python for Data Science', credits: 4, department: 'AI & DS', semester: 3 },
  { code: 'AID401', name: 'Deep Learning Foundations', credits: 4, department: 'AI & DS', semester: 5 },
  { code: 'AID402', name: 'Natural Language Processing', credits: 3, department: 'AI & DS', semester: 5 },
  { code: 'IT301', name: 'Web Technologies', credits: 3, department: 'Information Technology', semester: 3 },
  { code: 'IT401', name: 'Cyber Security Essentials', credits: 3, department: 'Information Technology', semester: 5 },
  { code: 'IT402', name: 'Mobile Application Development', credits: 3, department: 'Information Technology', semester: 5 },
  { code: 'ME301', name: 'Thermodynamics', credits: 4, department: 'Mechanical', semester: 3 },
  { code: 'ME401', name: 'Manufacturing Processes', credits: 3, department: 'Mechanical', semester: 5 },
  { code: 'CE301', name: 'Structural Analysis', credits: 4, department: 'Civil', semester: 3 },
  { code: 'CE401', name: 'Transportation Engineering', credits: 3, department: 'Civil', semester: 5 },
  { code: 'EE301', name: 'Circuit Theory', credits: 4, department: 'Electrical', semester: 3 },
  { code: 'EE401', name: 'Power Systems', credits: 3, department: 'Electrical', semester: 5 },
  { code: 'MBA201', name: 'Organizational Behaviour', credits: 3, department: 'MBA', semester: 2 },
  { code: 'MBA301', name: 'Strategic Management', credits: 3, department: 'MBA', semester: 3 },
  { code: 'BBA201', name: 'Principles of Marketing', credits: 3, department: 'BBA', semester: 2 },
  { code: 'BCA301', name: 'Object Oriented Programming', credits: 4, department: 'BCA', semester: 3 },
  { code: 'MCA401', name: 'Advanced Database Systems', credits: 4, department: 'MCA', semester: 4 },
  { code: 'CSELab5', name: 'OS Laboratory', credits: 2, department: 'Computer Science', semester: 5 },
];

export function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundType=gradientLinear&fontWeight=600`;
}

export function indianPhone(rng: SeededRng): string {
  const prefix = rng.pick(['98', '97', '96', '95', '94', '93', '91', '90', '88', '87'] as const);
  return `+91 ${prefix}${rng.int(10, 99)} ${rng.int(100000, 999999)}`;
}

export function emailFor(name: string, domain = 'sgvu.edu.in'): string {
  const local = name
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .replace(/\s+/g, '.');
  return `${local}@${domain}`;
}

export function employeeId(rng: SeededRng, deptCode: string): string {
  return `FAC-${deptCode}-${rng.int(1000, 9999)}`;
}

export function rollNumber(
  rng: SeededRng,
  programCode: string,
  batchYear: number,
  semester: number,
  index: number,
): string {
  const yy = String(batchYear).slice(-2);
  return `${yy}${programCode}${String(semester).padStart(2, '0')}${String(1000 + index).slice(-3)}`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function academicSessionAnchor(now = new Date()): Date {
  // Odd-semester style session starting July of current/previous year
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 6, 15); // 15 July
}

export function gradeFromPercent(p: number): string {
  if (p >= 90) return 'O';
  if (p >= 80) return 'A+';
  if (p >= 70) return 'A';
  if (p >= 60) return 'B+';
  if (p >= 50) return 'B';
  if (p >= 40) return 'C';
  return 'F';
}

export function academicStatusFromAttendance(att: number, overall: number): string {
  if (overall < 40 || att < 50) return 'AT_RISK';
  if (att < 75) return 'CONDITIONAL';
  if (overall >= 75) return 'GOOD_STANDING';
  return 'ACTIVE';
}
