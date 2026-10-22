import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';

const studentId = '10000000-0000-4000-8000-000000000001';
const student = {
  user_id: studentId,
  name: 'Synthetic Student',
  enrollment_number: 'SYNTH-001',
  profile_picture_url: null,
};
function setup(matches: (typeof student)[] = [student]) {
  const query = jest.fn((sql: string) =>
    Promise.resolve(sql.includes('FROM users u') ? matches : []),
  );
  const service = new ExamCellEnterpriseService(
    { query } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { query, service };
}

describe('Examination identity lookup', () => {
  it.each(['SYNTH-001', studentId, `student:${studentId}`])(
    'verifies an exact student identifier: %s',
    async (payload) => {
      const { query, service } = setup();
      const result = await service.verifyStudentByQr(
        'tenant',
        'actor',
        payload,
      );
      expect(result.verified).toBe(true);
      expect(result.student.user_id).toBe(studentId);
      expect(query.mock.calls[0][0]).toContain(
        'sp.profile_photo_url AS profile_picture_url',
      );
      expect(query.mock.calls[0][0]).toContain(
        "student_role.role_name = 'Student'",
      );
      expect(query.mock.calls[0][0]).toContain('sp.tenant_id = u.tenant_id');
      expect(query.mock.calls[0][0]).toContain('u.is_active = true');
    },
  );

  it('does not use arbitrary partial enrollment matches', async () => {
    const { query, service } = setup([]);
    await expect(
      service.verifyStudentByQr('tenant', 'actor', 'SYNTH'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query.mock.calls[0][0]).not.toContain('ILIKE');
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO student_identity_verifications'),
      ),
    ).toBe(false);
  });

  it('rejects duplicate exact names or identifiers without recording a successful verification', async () => {
    const { query, service } = setup([
      student,
      { ...student, user_id: '20000000-0000-4000-8000-000000000002' },
    ]);
    await expect(
      service.verifyStudentByQr('tenant', 'actor', 'Synthetic Student'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls[0][0]).toContain('LIMIT 2');
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO student_identity_verifications'),
      ),
    ).toBe(false);
  });

  it('rejects a non-student or foreign UUID without falling back to a name lookup', async () => {
    const { query, service } = setup([]);
    await expect(
      service.verifyStudentByQr('tenant', 'actor', studentId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
