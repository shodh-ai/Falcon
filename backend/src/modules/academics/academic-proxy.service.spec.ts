import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AcademicProxyService } from './academic-proxy.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SUBSTITUTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQUEST = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const slot = {
  timetable_id: SLOT,
  course_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
  faculty_user_id: OWNER,
  day_of_week: 1,
  start_time: '09:00:00',
  end_time: '10:00:00',
};

function setup(respond: (sql: string, params?: unknown[]) => unknown[]) {
  const manager = { query: jest.fn(async (sql: string, params?: unknown[]) => respond(sql, params)) };
  const dataSource = {
    transaction: jest.fn(async (run: (db: typeof manager) => Promise<unknown>) => run(manager)),
    query: jest.fn(async (sql: string, params?: unknown[]) => respond(sql, params)),
  };
  const notify = { approvalRequired: jest.fn(), leaveApproved: jest.fn() };
  return { service: new AcademicProxyService(dataSource as never, notify as never),
    manager, dataSource, notify };
}

describe('date-specific substitute class', () => {
  it('lists only active dated classes and returns a date-only value', async () => {
    const { service, dataSource } = setup(() => []);
    await service.listLecturesForLeaveDates(OWNER, TENANT, '2026-10-26', '2026-10-27');
    const sql = dataSource.query.mock.calls[0][0];
    expect(sql).toContain('t.deleted_at IS NULL');
    expect(sql).toContain('t.valid_from');
    expect(sql).toContain('t.valid_to');
    expect(sql).toContain('d::date::text AS lecture_date');
    expect(sql).toContain("m.status='APPROVED'");
    expect(sql).toContain('m.target_date::text AS lecture_date');
  });

  it('rejects a date that does not match the original class day', async () => {
    const { service } = setup((sql) => sql.includes('FROM academic_timetables t') ? [slot] : []);
    await expect(service.createProxyRequest(OWNER, TENANT, {
      timetable_id: SLOT, proxy_faculty_id: SUBSTITUTE, date_of_proxy: '2026-10-27',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a candidate whose own timetable overlaps the class', async () => {
    const { service, manager } = setup((sql) => {
      if (sql.includes('FROM academic_timetables t') && sql.includes('t.timetable_id=$1::uuid')) return [slot];
      if (sql.includes('SELECT proxy.user_id')) return [{ user_id: SUBSTITUTE }];
      if (sql.includes('UNION ALL') && sql.includes('academic_proxy_requests')) return [{ '?column?': 1 }];
      return [];
    });
    await expect(service.createProxyRequest(OWNER, TENANT, {
      timetable_id: SLOT, proxy_faculty_id: SUBSTITUTE, date_of_proxy: '2026-10-26',
    })).rejects.toThrow('another class');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_proxy_requests'))).toBe(false);
  });

  it('offers substitution on an approved swapped date using the swapped time', async () => {
    const { service, manager } = setup((sql) => {
      if (sql.includes('FROM academic_timetables t') && sql.includes('t.timetable_id=$1::uuid')) return [slot];
      if (sql.includes('SELECT source_date::text AS source_date,target_start_time')) {
        return [{ source_date: '2026-10-26', target_start_time: '11:00:00', target_end_time: '12:00:00' }];
      }
      if (sql.includes('SELECT proxy.user_id')) return [{ user_id: SUBSTITUTE }];
      if (sql.includes('INSERT INTO academic_proxy_requests')) return [{ proxy_id: REQUEST }];
      return [];
    });
    await expect(service.createProxyRequest(OWNER, TENANT, {
      timetable_id: SLOT, proxy_faculty_id: SUBSTITUTE, date_of_proxy: '2026-10-27',
    })).resolves.toMatchObject({ proxy_id: REQUEST });
    const conflict = manager.query.mock.calls.find(([sql]) => String(sql).includes('UNION ALL'));
    expect(conflict?.[1]).toEqual([TENANT, SUBSTITUTE, '2026-10-27', SLOT, '11:00:00', '12:00:00']);
  });

  it('rejects a substitute who is on approved leave', async () => {
    const { service } = setup((sql) => {
      if (sql.includes('FROM academic_timetables t') && sql.includes('t.timetable_id=$1::uuid')) return [slot];
      if (sql.includes('SELECT proxy.user_id')) return [{ user_id: SUBSTITUTE }];
      if (sql.includes('FROM staff_leave_requests')) return [{ one: 1 }];
      return [];
    });
    await expect(service.createProxyRequest(OWNER, TENANT, {
      timetable_id: SLOT, proxy_faculty_id: SUBSTITUTE, date_of_proxy: '2026-10-26',
    })).rejects.toThrow('approved leave');
  });

  it('requires the nominated substitute to accept before HOD approval', async () => {
    const { service } = setup((sql) => {
      if (sql.includes('FROM academic_proxy_requests p') && sql.includes('FOR UPDATE OF p')) return [{
        proxy_id: REQUEST, status: 'PENDING_HOD_APPROVAL', accepted_at: null,
        faculty_dept_id: 7, absent_faculty_id: OWNER, proxy_faculty_id: SUBSTITUTE,
        timetable_id: SLOT, course_id: slot.course_id, proxy_date: '2026-10-26',
      }];
      if (sql.includes('SELECT 1 FROM users h')) return [{ one: 1 }];
      return [];
    });
    await expect(service.actOnProxyRequest(OWNER, TENANT, REQUEST, 'APPROVE'))
      .rejects.toThrow('must accept');
  });

  it('requires independent approval when HOD nominated the substitute', async () => {
    const { service } = setup((sql) => {
      if (sql.includes('FROM academic_proxy_requests p') && sql.includes('FOR UPDATE OF p')) return [{
        proxy_id: REQUEST, status: 'PENDING_HOD_APPROVAL', accepted_at: new Date().toISOString(),
        requested_by_user_id: OWNER, faculty_dept_id: 7, absent_faculty_id: SUBSTITUTE,
        proxy_faculty_id: OWNER, timetable_id: SLOT, course_id: slot.course_id,
        proxy_date: '2026-10-26',
      }];
      if (sql.includes('SELECT 1 FROM users h')) return [{ one: 1 }];
      return [];
    });
    await expect(service.actOnProxyRequest(OWNER, TENANT, REQUEST, 'APPROVE'))
      .rejects.toThrow('cannot approve their own request');
  });

  it('prevents a different faculty member from accepting the offer', async () => {
    const { service } = setup((sql) => sql.includes('FROM academic_proxy_requests') && sql.includes('FOR UPDATE')
      ? [{ proxy_faculty_id: SUBSTITUTE, status: 'PENDING_SUBSTITUTE_ACCEPTANCE' }] : []);
    await expect(service.actOnProxyOffer(OWNER, TENANT, REQUEST, 'ACCEPT'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
