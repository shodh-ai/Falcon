export const STRUCTURES = [
  'NONE',
  'HOD_ONLY',
  'PRINCIPAL_ONLY',
  'PRINCIPAL_HOD',
] as const;
export type DepartmentStructure = (typeof STRUCTURES)[number];
export type OfficeKind = 'PRINCIPAL' | 'HOD';
export interface OfficeContext {
  office_id: string;
  appointment_id: string;
  dept_id: number;
  kind: OfficeKind;
  login_alias: string;
}
export function officeEnabled(
  structure: DepartmentStructure,
  kind: OfficeKind,
) {
  return structure === 'PRINCIPAL_HOD' || structure === `${kind}_ONLY`;
}
export function reportingKind(structure: DepartmentStructure): OfficeKind | null {
  if (structure === 'NONE') return null;
  return structure === 'HOD_ONLY' ? 'HOD' : 'PRINCIPAL';
}
