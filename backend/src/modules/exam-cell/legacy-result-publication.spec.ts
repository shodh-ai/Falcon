import { ExamCellController } from './exam-cell.controller';
import { ExamCellService } from './exam-cell.service';
const course = '11111111-1111-4111-8111-111111111111';
const req = {
  user: { user_id: 'actor', tenant_id: 'tenant', role: 'ExamCell' },
};
function fixture() {
  const getSessionForCourse = jest
    .fn()
    .mockResolvedValue({ session_id: 'session', semester: 4 });
  const declareSession = jest
    .fn()
    .mockResolvedValue({ declared: 1, session_id: 'session' });
  const unsafePublish = jest.fn();
  const examCell = new ExamCellService(
    { query: unsafePublish } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { getSessionForCourse, declareSession } as never,
  );
  const controller = new ExamCellController(
    examCell,
    { getSessionForCourse, declareSession } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, getSessionForCourse, declareSession, unsafePublish };
}
describe('Legacy publication API', () => {
  it('delegates to the approved transactional result pipeline', async () => {
    const f = fixture();
    await expect(
      f.controller.publishResults(req, {
        course_id: course,
        exam_type: 'END_TERM',
        batch_semester: 4,
      }),
    ).resolves.toMatchObject({ declared: 1 });
    expect(f.declareSession).toHaveBeenCalledWith(
      'tenant',
      'session',
      'actor',
      { declaration_note: 'Published via legacy results endpoint' },
    );
    expect(f.unsafePublish).not.toHaveBeenCalled();
  });
  it('preserves approval failures without a fallback write', async () => {
    const f = fixture();
    f.declareSession.mockRejectedValue(new Error('Dean approval required'));
    await expect(
      f.controller.publishResults(req, {
        course_id: course,
        exam_type: 'END_TERM',
      }),
    ).rejects.toThrow('Dean approval required');
    expect(f.unsafePublish).not.toHaveBeenCalled();
  });
  it('rejects malformed course IDs and mismatched semesters before publishing', async () => {
    const f = fixture();
    await expect(
      f.controller.publishResults(req, {
        course_id: 'bad',
        exam_type: 'END_TERM',
      }),
    ).rejects.toThrow('valid course');
    expect(f.getSessionForCourse).not.toHaveBeenCalled();
    await expect(
      f.controller.publishResults(req, {
        course_id: course,
        exam_type: 'END_TERM',
        batch_semester: 5,
      }),
    ).rejects.toThrow('semester does not match');
    expect(f.declareSession).not.toHaveBeenCalled();
  });
});
