import { BadRequestException } from '@nestjs/common';
import { ExamCellService } from './exam-cell.service';

function setup(capacity = 10, enrollmentStatus = 'ENROLLED') {
  let committedSeats = [
    { student_user_id: 'old', room: 'A', seat_number: '01' },
  ];
  const outside = jest.fn();
  const transaction = jest.fn(
    async (
      work: (manager: {
        query: (sql: string, params?: unknown[]) => Promise<unknown[]>;
      }) => Promise<unknown>,
    ) => {
      let seats = committedSeats.map((row) => ({ ...row }));
      const query = jest.fn(async (sql: string, params: unknown[] = []) => {
        await Promise.resolve();
        if (sql.includes('FROM campus_spaces'))
          return [{ room_number: 'A', capacity, building_name: 'Block' }];
        if (sql.includes('SELECT 1 FROM exam_schedules')) return [{}];
        if (sql.includes('SELECT es.exam_schedule_id, es.exam_date'))
          return [{ exam_schedule_id: 'schedule', subject_name: 'Course' }];
        if (
          sql.includes('SELECT DISTINCT u.user_id') &&
          enrollmentStatus !== 'ENROLLED' &&
          sql.includes("e.status = 'ENROLLED'")
        )
          return [];
        if (sql.includes('SELECT DISTINCT u.user_id'))
          return [
            { user_id: 'one', name: 'One', branch_code: 'ONE' },
            { user_id: 'two', name: 'Two', branch_code: 'TWO' },
          ];
        if (sql.includes('DELETE FROM exam_seating_allocations')) {
          seats = [];
          return [[], 1];
        }
        if (
          sql.includes('SELECT room, seat_number FROM exam_seating_allocations')
        )
          return seats;
        if (sql.includes('INSERT INTO exam_seating_allocations')) {
          seats.push({
            student_user_id: String(params[3]),
            room: String(params[2]),
            seat_number: String(params[4]),
          });
          return [];
        }
        if (sql.includes('INSERT INTO exam_seating_runs'))
          return [{ run_id: 'owned-run' }];
        if (sql.includes('SELECT a.exam_schedule_id'))
          return seats.map((seat) => ({
            ...seat,
            exam_schedule_id: 'schedule',
          }));
        if (sql.includes('SELECT es.exam_schedule_id, es.subject_id'))
          return [{ exam_schedule_id: 'schedule', subject_name: 'Course' }];
        return [];
      });
      const result = await work({ query });
      committedSeats = seats;
      return result;
    },
  );
  const service = new ExamCellService(
    { query: outside, transaction } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,

    {} as never,
  );
  return { service, outside, transaction, seats: () => committedSeats };
}
const input = {
  allocation_strategy: 'by_schedule',
  exam_schedule_id: 'schedule',
  semester: 9,
  rooms: ['A'],
};

describe('Seating allocation persistence', () => {
  it('returns the run it created and publishes using the same transaction', async () => {
    const { service, outside, seats } = setup();
    const result = await service.autoAllocateSeating('tenant', input);
    expect(result).toMatchObject({ allocated: 2, run_id: 'owned-run' });
    expect(result.allocations).toHaveLength(2);
    expect(seats()).toHaveLength(2);
    expect(outside).not.toHaveBeenCalled();
  });
  it('rolls back prior-seat deletion when capacity is insufficient', async () => {
    const { service, seats } = setup(1);
    await expect(
      service.autoAllocateSeating('tenant', input),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(seats()).toEqual([
      { student_user_id: 'old', room: 'A', seat_number: '01' },
    ]);
  });
  it.each(['COMPLETED', 'FAILED'])(
    'keeps subject/semester members after INTERNAL publication sets enrollment %s',
    async (status) => {
      const { service, seats } = setup(10, status);
      const result = await service.autoAllocateSeating('tenant', input);
      expect(result.allocated).toBe(2);
      expect(seats()).toHaveLength(2);
    },
  );

  it('rejects an unknown room instead of assuming invented capacity', async () => {
    const { service, seats } = setup();
    await expect(
      service.autoAllocateSeating('tenant', { ...input, rooms: ['missing'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(seats()).toHaveLength(1);
  });
  it('rejects resource overflow without silently assigning only some students', async () => {
    const { service, seats } = setup(1);
    await expect(
      service.assignSubjectToRoom('tenant', {
        exam_schedule_id: 'schedule',
        room: 'A',
        semester: 9,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(seats()).toHaveLength(1);
  });
});

describe('Published seating snapshot', () => {
  it('removes empty-room snapshots when replacing a schedule plan', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const manager = { query };
    const service = new ExamCellService(
      {
        transaction: (work: (executor: typeof manager) => Promise<unknown>) =>
          work(manager),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,

      {} as never,
    );
    await service.publishSeatingPlans('tenant', 'schedule');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'DELETE FROM exam_seating_plans WHERE tenant_id = $1 AND exam_schedule_id = $2',
      ),
      ['tenant', 'schedule'],
    );
  });
});

describe('Seat swap lock order', () => {
  it('locks the schedule before allocations to match allocation/publication transactions', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT student_user_id, seat_number')
          ? [
              { student_user_id: 'one', seat_number: '01' },
              { student_user_id: 'two', seat_number: '03' },
            ]
          : [],
      ),
    );
    const manager = { query };
    const service = new ExamCellService(
      {
        transaction: (work: (executor: typeof manager) => Promise<unknown>) =>
          work(manager),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,

      {} as never,
    );
    await service.swapSeatingAllocations('tenant', {
      exam_schedule_id: 'schedule',
      room: 'A',
      student_user_id_a: 'one',
      student_user_id_b: 'two',
    });
    expect(query.mock.calls[0][0]).toContain('FROM exam_schedules');
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][0]).toContain('FROM exam_seating_allocations');
  });
});
