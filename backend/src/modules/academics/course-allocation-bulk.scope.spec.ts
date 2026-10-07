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

  it('rejects legacy .xls uploads with an actionable conversion message', async () => {
    const service = makeService([]);

    await expect(
      service.parseUploadFile(Buffer.from('not an xls workbook'), 'teaching-load.xls'),
    ).rejects.toThrow('Save the workbook as .xlsx or CSV');
  });

  it('parses a valid CSV matrix and ignores blank trailing rows', async () => {
    const service = makeService([]);
    const csv = [
      'Faculty username,Subject Fullname,Subject Code,Sub Type,Semester,Program Name,Credits',
      'faculty.one,Data Structures,CS3001,TH,III-A,BTECH CSE,3',
      ',,,,,,,',
      '',
    ].join('\n');

    await expect(
      service.parseUploadFile(Buffer.from(csv), 'teaching-load.csv'),
    ).resolves.toEqual([
      {
        faculty_username: 'faculty.one',
        subject_fullname: 'Data Structures',
        subject_code: 'CS3001',
        sub_type: 'TH',
        semester: 'III-A',
        program_name: 'BTECH CSE',
        credits: 3,
      },
    ]);
  });

  it('preserves commas and escaped quotes inside quoted CSV fields', async () => {
    const service = makeService([]);
    const csv = [
      'Faculty username,Subject Fullname,Subject Code,Sub Type,Semester,Program Name,Credits',
      'faculty.one,"Pharmaceutical Chemistry, Advanced",PC401,TH,IV,BPHARM,4',
    ].join('\n');

    await expect(
      service.parseUploadFile(Buffer.from(csv), 'teaching-load.csv'),
    ).resolves.toEqual([
      {
        faculty_username: 'faculty.one',
        subject_fullname: 'Pharmaceutical Chemistry, Advanced',
        subject_code: 'PC401',
        sub_type: 'TH',
        semester: 'IV',
        program_name: 'BPHARM',
        credits: 4,
      },
    ]);
  });

  it('rejects unterminated quoted CSV fields with a clear validation error', async () => {
    const service = makeService([]);
    const csv = [
      'Faculty username,Subject Fullname,Subject Code,Sub Type,Semester,Program Name,Credits',
      'faculty.one,"Broken subject,PC401,TH,IV,BPHARM,4',
    ].join('\n');

    await expect(
      service.parseUploadFile(Buffer.from(csv), 'teaching-load.csv'),
    ).rejects.toThrow('unterminated quoted field');
  });

  it('does not fall back to an unrelated programme when a HOD department has none', async () => {
    const service = makeService([[], [], []]);

    await expect((service as any).resolveDefaultProgramId([10])).rejects.toThrow(
      'No active programme is configured for the selected department',
    );
  });
});
