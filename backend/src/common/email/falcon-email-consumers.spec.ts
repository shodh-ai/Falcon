import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { StudentOnboardingWelcomeEmailListener } from '../../modules/student-onboarding/student-onboarding-welcome-email.listener';
import { AlumniWelcomeEmailListener } from '../../modules/alumni/alumni-welcome-email.listener';
import { FinanceReceiptService } from '../../modules/finance/finance-receipt.service';
import { SchedulerService } from '../../scheduler/scheduler.service';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('existing portal email sender consumers', () => {
  const settings: Record<string, string> = {
    EMAIL_HOST: 'smtp.gmail.com',
    EMAIL_PORT: '587',
    EMAIL_SECURE: 'false',
    EMAIL_USER: 'noreply.ums@mygyanvihar.com',
    EMAIL_PASSWORD: 'mock-credential-not-valid',
    EMAIL_FROM: 'Legacy Sender <legacy@example.test>',
    FRONTEND_URL: 'http://127.0.0.1:3001',
  };
  const config = {
    get: (key: string, fallback?: string) => settings[key] ?? fallback,
  } as ConfigService;
  const sendMail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail.mockResolvedValue({ accepted: ['recipient@example.test'] });
    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
  });

  const verifySender = () => {
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'Falcon <noreply.ums@mygyanvihar.com>',
      }),
    );
    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        requireTLS: true,
        auth: {
          user: 'noreply.ums@mygyanvihar.com',
          pass: 'mock-credential-not-valid',
        },
      }),
    );
    expect(settings.EMAIL_FROM).toBe('Legacy Sender <legacy@example.test>');
  };

  it('uses the institutional sender for student onboarding mail without constructor transport creation', async () => {
    const listener = new StudentOnboardingWelcomeEmailListener(config);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    await listener.onApproved({
      tenantId: 'tenant-a',
      userId: 'synthetic-student',
      studentName: 'Synthetic Student',
      officialEmail: 'recipient@example.test',
    });
    verifySender();
  });

  it('uses the institutional sender for alumni welcome mail', async () => {
    const listener = new AlumniWelcomeEmailListener(config);
    await listener.onConversionApproved({
      tenantId: 'tenant-a',
      studentUserId: 'synthetic-student',
      studentName: 'Synthetic Student',
      officialEmail: 'recipient@example.test',
    });
    verifySender();
  });

  it('uses the institutional sender for receipt mail with all database work mocked', async () => {
    const db = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            name: 'Synthetic Student',
            official_email: 'recipient@example.test',
          },
        ])
        .mockResolvedValueOnce([]),
    };
    const service = new FinanceReceiptService(db as never, config);
    await service.emailReceipt('synthetic-student', '/synthetic-receipt', 1);
    verifySender();
  });

  it('uses the institutional sender for scheduler mail without starting timers or jobs', async () => {
    const tasks = { distributeTasksForMonth: jest.fn().mockResolvedValue([]) };
    const service = new SchedulerService(
      {} as never,
      {} as never,
      {} as never,
      tasks as never,
      config,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    await service.distributeMonthlyTasks();
    verifySender();
    expect(tasks.distributeTasksForMonth).toHaveBeenCalledTimes(1);
  });
});
