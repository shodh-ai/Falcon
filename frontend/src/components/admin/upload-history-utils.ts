export type UploaderInfo = {
  name: string;
  role: string;
  department: string;
  employeeId?: string | null;
  email?: string | null;
};

export function abbreviateDepartment(department: string, maxLength: number): string {
  const value = department.trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`;
}
