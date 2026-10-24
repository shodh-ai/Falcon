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

function setup(respond: (sql: string) => unknown[]) {
  const manager = { query: jest.fn(async (sql: string) => respond(sql)) };
  const dataSource = {
    transaction: jest.fn(async (run: (db: typeof manager) => Promise<unknown>) => run(manager)),
    query: jest.fn(async (sql: string) => respond(sql)),
  };
  const notify = { approvalRequired: jest.fn(), leaveApproved: jest.fn() };
  return { service: new AcademicProxyService(dataSource as never, notify as never),
    manager, dataSource, notify };
}

describe('date-specific substitute class', () => {
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

  it('prevents a different faculty member from accepting the offer', async () => {
    const { service } = setup((sql) => sql.includes('FROM academic_proxy_requests') && sql.includes('FOR UPDATE')
      ? [{ proxy_faculty_id: SUBSTITUTE, status: 'PENDING_SUBSTITUTE_ACCEPTANCE' }] : []);
    await expect(service.actOnProxyOffer(OWNER, TENANT, REQUEST, 'ACCEPT'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
