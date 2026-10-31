jest.mock('uuid', () => ({ v4: jest.fn() }));
import { FacultyProfileService } from './faculty-profile.service';

describe('Faculty weekly workload', () => {
  const makeService = (scheduled: unknown[], changes: unknown[], events: unknown[] = []) => {
    const query = jest.fn().mockResolvedValueOnce(scheduled).mockResolvedValueOnce(changes).mockResolvedValueOnce(events);
    const service = new FacultyProfileService({ query } as any, {} as any, {} as any, {} as any);
    return { service, query };
  };

  it('subtracts an exact approved cancellation and adds an approved extra class', async () => {
    const { service, query } = makeService([
      { timetable_id: 'slot-1', course_id: 'course-1', class_date: '2026-10-26', start_time: '09:00:00', minutes: 60 },
      { timetable_id: 'slot-2', course_id: 'course-2', class_date: '2026-10-27', start_time: '10:00:00', minutes: 120 },
    ], [
      { adjustment_id: 'cancel-1', adjustment_type: 'CANCEL', course_id: 'course-1', class_date: '2026-10-26', start_time: '09:00:00' },
      { adjustment_id: 'extra-1', adjustment_type: 'EXTRA_CLASS', course_id: 'course-1', class_date: '2026-10-29', start_time: '11:00:00' },
    ]);

    await expect(service.getWeeklyWorkload('tenant-1', 'faculty-1', '2026-10-26')).resolves.toMatchObject({
      scheduled_sessions: 2, scheduled_minutes: 180,
      cancelled_sessions: 1, cancelled_minutes: 60,
      extra_sessions: 1, extra_minutes: 60,
      effective_sessions: 2, effective_minutes: 180,
      unmatched_cancellations: 0,
    });
    expect(query.mock.calls[1][0]).toContain("status IN ('APPROVED', 'NOTIFIED')");
  });

  it('does not silently subtract an ambiguous cancellation from two sections', async () => {
    const { service } = makeService([
      { timetable_id: 'section-a', course_id: 'course-1', class_date: '2026-10-26', start_time: '09:00:00', minutes: 60 },
      { timetable_id: 'section-b', course_id: 'course-1', class_date: '2026-10-26', start_time: '09:00:00', minutes: 60 },
    ], [
      { adjustment_id: 'cancel-1', adjustment_type: 'CANCEL', course_id: 'course-1', class_date: '2026-10-26', start_time: '09:00:00' },
    ]);
    await expect(service.getWeeklyWorkload('tenant-1', 'faculty-1', '2026-10-26')).resolves.toMatchObject({
      effective_minutes: 120, unmatched_cancellations: 1,
    });
  });

  it('keeps an event-exempted class in weekly workload', async()=>{
    const {service}=makeService([{timetable_id:'slot-1',course_id:'course-1',class_date:'2026-10-26',start_time:'09:00:00',minutes:60}],[],
      [{timetable_id:'slot-1',class_date:'2026-10-26'}]);
    await expect(service.getWeeklyWorkload('tenant-1','faculty-1','2026-10-26')).resolves.toMatchObject({
      event_exempted_sessions:1,event_exempted_minutes:60,effective_sessions:1,effective_minutes:60,
    });
  });

  it('rejects a non-Monday or malformed week', async () => {
    const { service, query } = makeService([], []);
    await expect(service.getWeeklyWorkload('tenant-1', 'faculty-1', '2026-10-27')).rejects.toThrow('week_start');
    await expect(service.getWeeklyWorkload('tenant-1', 'faculty-1', '2026-02-30')).rejects.toThrow('week_start');
    expect(query).not.toHaveBeenCalled();
  });
});
