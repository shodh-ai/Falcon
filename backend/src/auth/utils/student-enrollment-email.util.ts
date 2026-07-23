/** Official student mailbox pattern: name.enrollmentNo@domain (e.g. anshuman.2549873@…). */
export function isStudentEnrollmentEmail(
  email: string | null | undefined,
): boolean {
  return /^[^@]*\.\d{5,}@/i.test((email ?? '').trim());
}
