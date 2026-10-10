import { describe, expect, it } from 'vitest';
import { mergeVerificationQueueResults } from '@/components/campus-admin/CampusAdminVerificationsPage';

const facultyRow = {
  user_id: 'faculty-1',
  name: 'Dr Amit Kaushik',
  official_email: 'amit.kaushik@mygyanvihar.com',
  onboarding_status: 'PENDING_ADMIN_APPROVAL',
  role_name: 'Faculty',
  portal_kind: 'staff',
  submitted_at: null,
  doc_count: '4',
};

describe('campus-admin verification queue merging', () => {
  it('keeps faculty submissions visible when the student queue fails', () => {
    const result = mergeVerificationQueueResults([
      { status: 'rejected', reason: new Error('403 Forbidden') },
      { status: 'fulfilled', value: [facultyRow] },
    ]);

    expect(result.rows).toEqual([facultyRow]);
    expect(result.error).toContain('student queue: 403 Forbidden');
  });

  it('reports both failures when neither queue is available', () => {
    const result = mergeVerificationQueueResults([
      { status: 'rejected', reason: new Error('student unavailable') },
      { status: 'rejected', reason: new Error('faculty unavailable') },
    ]);

    expect(result.rows).toEqual([]);
    expect(result.error).toContain('student queue: student unavailable');
    expect(result.error).toContain('faculty queue: faculty unavailable');
  });
});
