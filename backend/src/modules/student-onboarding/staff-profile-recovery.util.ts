import { BadRequestException } from '@nestjs/common';

export const STAFF_RECOVERY_REQUIRED_FIELDS = [
  'staff_mobile', 'gender', 'date_of_birth', 'current_address',
  'emergency_contact_name', 'emergency_contact_phone',
  'degree_level', 'degree_name', 'university', 'passing_year',
] as const;
const QUALIFICATIONS = new Set(['degree_level', 'degree_name', 'university', 'passing_year', 'specialization']);

// Older submissions used both top-level and nested qualification fields.
// Flatten for display/validation only. Never replace the stored original JSON.
export function recoveryValues(profile: Record<string, unknown>, phone?: unknown) {
  const values = { ...profile };
  const qualification = profile.qualification as Record<string, unknown> | undefined;
  for (const key of QUALIFICATIONS) {
    if (qualification?.[key] != null && String(qualification[key]).trim()) values[key] = qualification[key];
  }
  if (!String(values.staff_mobile ?? '').trim() && phone) values.staff_mobile = phone;
  return values;
}

export function invalidRecoveryFields(profile: Record<string, unknown>, phone?: unknown): string[] {
  const values = recoveryValues(profile, phone);
  const missing: string[] = STAFF_RECOVERY_REQUIRED_FIELDS.filter((key) => !String(values[key] ?? '').trim());
  for (const key of ['staff_mobile', 'emergency_contact_phone']) {
    if (values[key] && !/^\+?[\d\s()-]{8,20}$/.test(String(values[key]))) missing.push(key);
  }
  if (values.date_of_birth) {
    const dob = String(values.date_of_birth);
    const date = new Date(`${dob}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dob || date > new Date()) missing.push('date_of_birth');
  }
  if (values.passing_year && (!Number.isInteger(Number(values.passing_year)) || Number(values.passing_year) < 1950 || Number(values.passing_year) > new Date().getFullYear())) missing.push('passing_year');
  return [...new Set(missing)];
}

export function assertRecoveryComplete(profile: Record<string, unknown>, phone?: unknown) {
  const invalid = invalidRecoveryFields(profile, phone);
  if (invalid.length) throw new BadRequestException(`Complete the important profile details: ${invalid.join(', ')}`);
}
