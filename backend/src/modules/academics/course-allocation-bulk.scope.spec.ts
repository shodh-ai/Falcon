import { CourseAllocationBulkService } from './course-allocation-bulk.service';

describe('CourseAllocationBulkService department programme scope', () => {
  function makeService(queryResults: unknown[]) {
    const dataSource = {
      query: jest.fn(async () => queryResults.shift()),
    };
    return new CourseAllocationBulkService(
      dataSource as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  const row = (program_name: string) => ({
    faculty_username: 'NF - Unassigned',
    subject_fullname: 'Data Structures',
    subject_code: 'CS3001',
    sub_type: 'TH',
    semester: 'III-A',
    program_name,
    credits: 3,
  });

  it('accepts legacy BTECH CSE aliases for a Computer Science HOD', async () => {
    const service = makeService([
      [],
      [],
      [{ dept_id: 10 }],
      [{ dept_id: 10 }],
      [{ dept_name: 'Computer Science' }],
      [
        {
          program_name: 'B.Tech Computer Science',
          program_code: 'BTECH-CSE',
          dept_name: null,
          scope_proven: false,
        },
      ],
      [],
    ]);

    const preview = await service.buildPreview('tenant-1', [row('BTECH CSE')], 'hod-1');

    expect(preview.rows[0].warnings).not.toContain(
      'Program "BTECH CSE" is outside your department scope',
    );
  });

  it('does not treat an unrelated unscoped programme as in-scope', async () => {
    const service = makeService([
      [],
      [],
      [{ dept_id: 10 }],
      [{ dept_id: 10 }],
      [{ dept_name: 'Computer Science' }],
      [
        {
          program_name: 'B.Tech Mechanical Engineering',
          program_code: 'BTECH-ME',
          dept_name: null,
          scope_proven: false,
        },
      ],
      [],
    ]);

    const preview = await service.buildPreview(
      'tenant-1',
      [row('BTECH ME')],
      'hod-1',
    );

    expect(preview.rows[0].warnings).toContain(
      'Program "BTECH ME" is outside your department scope',
    );
  });
});
