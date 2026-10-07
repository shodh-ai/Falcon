import { BadRequestException, ConflictException } from '@nestjs/common';
import { AcademicsService } from './academics.service';

describe('HOD timetable reliability', () => {
  function makeService(manager: { query: jest.Mock; transaction?: jest.Mock }) {
    const users = { manager };
    return new AcademicsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      users as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  }

  it('rejects overlapping faculty slots before opening a transaction', async () => {
    const manager = { query: jest.fn() };
    const service = makeService(manager);
    (service as any).resolveHodDepartmentIds = jest.fn().mockResolvedValue([10]);

    await expect(
      service.saveHodCourseAllocationTimetableBatch('tenant-1', 'hod-1', {
        semester: 'III-A',
        slots: [
          {
            course_id: 'course-1',
            faculty_user_id: 'faculty-1',
            day_of_week: 1,
            start_time: '09:00:00',
            end_time: '10:00:00',
          },
          {
            course_id: 'course-2',
            faculty_user_id: 'faculty-1',
            day_of_week: 1,
            start_time: '09:30:00',
            end_time: '10:30:00',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('reports an existing faculty collision through the shared guard', async () => {
    const manager = {
      query: jest.fn().mockResolvedValue([
        {
          timetable_id: 'slot-1',
          course_id: 'course-1',
          faculty_user_id: 'faculty-1',
          day_of_week: 2,
          start_time: '11:00:00',
          end_time: '12:00:00',
        },
      ]),
    };
    const service = makeService(manager);

    await expect(
      (service as any).assertTimetableSlotAvailable('tenant-1', {
        course_id: 'course-2',
        faculty_user_id: 'faculty-1',
        day_of_week: 2,
        start_time: '11:30:00',
        end_time: '12:30:00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists a valid batch after replacing the selected semester schedule', async () => {
    const transactionManager = {
      query: jest
        .fn()
        .mockResolvedValueOnce([]) // advisory lock
        .mockResolvedValueOnce([
          { course_id: 'course-1', faculty_user_id: 'faculty-1' },
        ]) // active allocation pairs
        .mockResolvedValueOnce([]) // stale rows for another allocation
        .mockResolvedValueOnce([]) // soft-delete existing semester rows
        .mockResolvedValueOnce([]), // insert
    };
    const manager = {
      query: jest.fn(),
      transaction: jest.fn(async (callback: (tx: any) => unknown) =>
        callback(transactionManager),
      ),
    };
    const service = makeService(manager);
    (service as any).resolveHodDepartmentIds = jest.fn().mockResolvedValue([10]);

    await expect(
      service.saveHodCourseAllocationTimetableBatch('tenant-1', 'hod-1', {
        semester: 'III-A',
        slots: [
          {
            course_id: 'course-1',
            faculty_user_id: 'faculty-1',
            day_of_week: 1,
            start_time: '09:00:00',
            end_time: '10:00:00',
          },
        ],
      }),
    ).resolves.toEqual({ success: true });
    expect(manager.transaction).toHaveBeenCalledTimes(1);
    expect(transactionManager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO academic_timetables'),
      ['tenant-1', 'course-1', 1, '09:00:00', '10:00:00', 'faculty-1'],
    );
  });
});
