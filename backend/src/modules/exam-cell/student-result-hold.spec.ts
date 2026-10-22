import { ForbiddenException } from '@nestjs/common';
import { assertStudentResultsAvailable } from './student-result-hold';
import { StudentPortalService } from '../student-portal/student-portal.service';
import { ParentService } from '../parent/parent.service';
import { AcademicsService } from '../academics/academics.service';
jest.mock('uuid', () => ({ v4: jest.fn() }));
function blocked() {
  return jest
    .fn<Promise<Array<{ has_open_ufm: boolean }>>, [string, unknown[]]>()
    .mockResolvedValue([{ has_open_ufm: true }]);
}
describe('Open UFM result hold', () => {
  it('binds both tenant and student and keeps existing hold policy explicit', async () => {
    const query = blocked();
    await expect(
      assertStudentResultsAvailable({ query } as never, 'tenant', 'student'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.mock.calls[0][0]).toContain("status<>'CLOSED'");
    expect(query.mock.calls[0][1]).toEqual(['tenant', 'student']);
  });
  it('allows a checked clear/closed case and propagates storage failure', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ has_open_ufm: false }])
      .mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      assertStudentResultsAvailable({ query } as never, 'tenant', 'student'),
    ).resolves.toBeUndefined();
    await expect(
      assertStudentResultsAvailable({ query } as never, 'tenant', 'student'),
    ).rejects.toThrow('database unavailable');
  });
  it('blocks component marks and GPA before reading stale published records', async () => {
    const query = blocked();
    await expect(
      StudentPortalService.prototype.getMarks.call(
        { dataSource: { query } },
        'tenant',
        'student',
      ),
    ).rejects.toThrow('withheld');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('blocks the student results API before reading old PASS reports', async () => {
    const query = blocked();
    await expect(
      AcademicsService.prototype.listResultsForStudent.call(
        { results: { manager: { query } } },
        'student',
        'tenant',
      ),
    ).rejects.toThrow('withheld');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('blocks parent grades and the parent academic summary for the authorized child', async () => {
    const query = blocked();
    await expect(
      ParentService.prototype.getMarks.call(
        { dataSource: { query } },
        'student',
        'tenant',
      ),
    ).rejects.toThrow('withheld');
    const assertChildLinked = jest
      .fn<Promise<string>, [string, string]>()
      .mockResolvedValue('tenant');
    await expect(
      ParentService.prototype.getAcademicsSummary.call(
        { dataSource: { query }, assertChildLinked },
        'parent',
        'student',
      ),
    ).rejects.toThrow('withheld');
    expect(assertChildLinked).toHaveBeenCalledWith('parent', 'student');
    expect(query).toHaveBeenCalledTimes(2);
  });
});
