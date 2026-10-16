import { ConfigService } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NotificationCronService } from './notification-cron.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationEventsListener } from './notification-events.listener';
import { OnboardingVerificationNotifyService } from './onboarding-verification-notify.service';
import { NotificationEmitterService } from './notification-emitter.service';
import { NotificationEvents } from './notification.events';

describe('NotificationCronService library delivery durability', () => {
  const loan = {
    loan_id: 'synthetic-loan',
    tenant_id: 'tenant-a',
    student_user_id: 'student-a',
    title: 'Synthetic book',
    due_date: '2026-10-01',
  };
  let context: TestingModule;
  let db: { query: jest.Mock };
  let dispatch: { dispatch: jest.Mock };
  let cron: NotificationCronService;
  let settings: Record<string, unknown>;

  beforeEach(async () => {
    db = {
      query: jest.fn().mockResolvedValueOnce([loan]).mockResolvedValue([]),
    };
    dispatch = { dispatch: jest.fn().mockResolvedValue(undefined) };
    settings = { PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED: 'true' };
    context = await Test.createTestingModule({
      // Real Nest listener registration verifies that errors are not swallowed.
      // No scheduler or external services are imported.
      imports: [EventEmitterModule.forRoot()],
      providers: [
        NotificationCronService,
        NotificationEventsListener,
        { provide: DataSource, useValue: db },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => settings[key] },
        },
        { provide: NotificationDispatchService, useValue: dispatch },
        { provide: OnboardingVerificationNotifyService, useValue: {} },
      ],
    }).compile();
    await context.init();
    cron = context.get(NotificationCronService);
  });

  afterEach(async () => {
    await context.close();
  });

  it.each([undefined, null, false, true, 'false', 'TRUE', '1', 'approved', ''])(
    'does not query or dispatch scheduled alerts without exact opt-in (%p)',
    async (value) => {
      if (value === undefined) {
        delete settings.PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED;
      } else {
        settings.PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED = value;
      }
      const emitter = context.get(EventEmitter2);
      const emit = jest.spyOn(emitter, 'emit');
      const emitAsync = jest.spyOn(emitter, 'emitAsync');

      await cron.scanLibraryOverdue();
      await cron.scanAttendanceWarnings();

      expect(db.query).not.toHaveBeenCalled();
      expect(dispatch.dispatch).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
      expect(emitAsync).not.toHaveBeenCalled();
    },
  );

  it('preserves sensitive step-up expiry cleanup when scheduled alerts are disabled', async () => {
    delete settings.PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED;
    db.query.mockReset().mockResolvedValue([]);

    await cron.expireSensitiveStepUpNotifications();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("metadata->>'type'='INVOICE_INTEGRITY_STEP_UP'"),
    );
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('preserves attendance alert production after explicit opt-in', async () => {
    db.query.mockReset().mockResolvedValue([
      {
        student_user_id: 'student-a',
        tenant_id: 'tenant-a',
        min_att: '68.6',
      },
    ]);
    const emit = jest
      .spyOn(context.get(EventEmitter2), 'emit')
      .mockReturnValue(true);

    await cron.scanAttendanceWarnings();

    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM student_course_enrollments'),
    );
    expect(emit).toHaveBeenCalledWith(
      NotificationEvents.ACADEMICS_ATTENDANCE_WARNING,
      {
        tenantId: 'tenant-a',
        userId: 'student-a',
        attendancePercent: 69,
        actionLink: '/student/attendance',
      },
    );
  });

  it('waits for actual dispatch before marking the overdue loan notified', async () => {
    let started: () => void = () => undefined;
    let finish: () => void = () => undefined;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    dispatch.dispatch.mockImplementation(() => {
      started();
      return pending;
    });

    const scan = cron.scanLibraryOverdue();
    await startedPromise;
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'student-a',
        category: 'OPERATIONS',
        actionLink: '/student/library',
      }),
    );

    finish();
    await scan;
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('SET overdue_notified_at = NOW()'),
      ['synthetic-loan'],
    );
    expect(dispatch.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
      db.query.mock.invocationCallOrder[1],
    );
  });

  it('propagates rejected dispatch through Nest and leaves the marker untouched', async () => {
    dispatch.dispatch.mockRejectedValue(new Error('dispatch unavailable'));
    await expect(cron.scanLibraryOverdue()).rejects.toThrow(
      'dispatch unavailable',
    );
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalledWith(
      expect.stringContaining('UPDATE operations_library_loans'),
      expect.anything(),
    );
  });

  it('does not dispatch or write when there are no eligible overdue loans', async () => {
    db.query.mockReset().mockResolvedValue([]);
    await cron.scanLibraryOverdue();
    expect(dispatch.dispatch).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch or write a marker when the loan scan fails', async () => {
    db.query.mockReset().mockRejectedValue(new Error('loan scan unavailable'));
    await expect(cron.scanLibraryOverdue()).rejects.toThrow(
      'loan scan unavailable',
    );
    expect(dispatch.dispatch).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('returns the library emitter promise so callers can await successful dispatch', async () => {
    const pending = Promise.resolve([]);
    const events = {
      emitAsync: jest.fn().mockReturnValue(pending),
      emit: jest.fn(),
    };
    const facade = new NotificationEmitterService(events as never);
    const payload = {
      tenantId: 'tenant-a',
      userId: 'student-a',
      bookTitle: 'Synthetic book',
      dueDate: '2026-10-01',
    };
    const result = facade.libraryOverdue(payload);
    expect(result).toBe(pending);
    await expect(result).resolves.toEqual([]);
    expect(events.emitAsync).toHaveBeenCalledWith(
      NotificationEvents.OPERATIONS_LIBRARY_OVERDUE,
      payload,
    );
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('propagates library emitter rejection to an awaiting caller', async () => {
    const events = {
      emitAsync: jest.fn().mockRejectedValue(new Error('dispatch unavailable')),
      emit: jest.fn(),
    };
    const facade = new NotificationEmitterService(events as never);
    await expect(
      facade.libraryOverdue({
        tenantId: 'tenant-a',
        userId: 'student-a',
        bookTitle: 'Synthetic book',
        dueDate: '2026-10-01',
      }),
    ).rejects.toThrow('dispatch unavailable');
    expect(events.emit).not.toHaveBeenCalled();
  });
});
