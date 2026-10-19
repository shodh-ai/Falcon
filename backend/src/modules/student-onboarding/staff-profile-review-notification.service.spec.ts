import { StaffProfileReviewNotificationService } from './staff-profile-review-notification.service';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));

describe('Staff profile correction email', () => {
  const email = {
    notification_id: 'email-1',
    recipient_email: 'faculty@example.edu',
    action_path: '/faculty/dashboard',
    attempts: 1,
    payload: {
      reason: 'Replace <script> and unclear PAN',
      fields: ['staff_mobile'],
      documents: ['PAN'],
    },
  };
  const config = {
    get: (key: string) =>
      ({
        EMAIL_HOST: 'smtp.example.edu',
        EMAIL_USER: 'hr@example.edu',
        EMAIL_PASSWORD: 'test-only',
        FRONTEND_URL: 'https://example.edu',
      })[key],
  };
  beforeEach(() => jest.clearAllMocks());

  it('persists one in-app notification and email to the exact tenant recipient in the decision transaction', async () => {
    const qr = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          { official_email: 'faculty@example.edu', role_name: 'Faculty' },
        ])
        .mockResolvedValueOnce([{ notification_id: 'email-1' }])
        .mockResolvedValueOnce([]),
    };
    const service = new StaffProfileReviewNotificationService(
      {} as never,
      config as never,
    );
    await service.enqueueCorrection(
      qr as never,
      {
        tenant_id: 'tenant',
        user_id: 'staff',
        review_id: 'review',
        revision: 2,
      },
      email.payload,
    );
    expect(qr.query.mock.calls[0][1]).toEqual(['tenant', 'staff']);
    expect(qr.query.mock.calls[1][1].slice(0, 5)).toEqual([
      'tenant',
      'review',
      'staff',
      2,
      'faculty@example.edu',
    ]);
    expect(qr.query.mock.calls[2][0]).toContain(
      'INSERT INTO falcon_notifications',
    );
  });

  it('sends HR feedback with escaped HTML and records SMTP acceptance', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([email])
      .mockResolvedValue([]);
    const sendMail = jest
      .fn()
      .mockResolvedValue({ accepted: [email.recipient_email], rejected: [] });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    await new StaffProfileReviewNotificationService(
      { query } as never,
      config as never,
    ).deliverPending();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'faculty@example.edu',
        text: expect.stringContaining('https://example.edu/faculty/dashboard'),
        html: expect.stringContaining('&lt;script&gt;'),
        messageId: '<staff-review-email-1@falcon.jataka.io>',
      }),
    );
    expect(query.mock.calls[1][0]).toContain("status = 'SENT'");
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(query.mock.calls[0][0].trim()).toMatch(/SELECT \* FROM claimed$/);
  });

  it('does not attempt SMTP when the SELECT claim returns no eligible emails', async () => {
    const query = jest.fn().mockResolvedValue([]);
    await new StaffProfileReviewNotificationService({ query } as never, config as never).deliverPending();
    expect(query).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it.each(['unavailable', 'rejected'])(
    'keeps a durable retry when SMTP is %s',
    async (mode) => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([email])
        .mockResolvedValue([]);
      const sendMail =
        mode === 'unavailable'
          ? jest.fn().mockRejectedValue(new Error('offline'))
          : jest
              .fn()
              .mockResolvedValue({
                accepted: [],
                rejected: [email.recipient_email],
              });
      (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
      await new StaffProfileReviewNotificationService(
        { query } as never,
        config as never,
      ).deliverPending();
      expect(query.mock.calls[1][0]).toContain("status = 'RETRY'");
      expect(query.mock.calls[1][1]).toEqual([
        'email-1',
        'EMAIL_DELIVERY_FAILED',
        2,
      ]);
      expect(
        query.mock.calls.some(([sql]) => sql.includes("status = 'SENT'")),
      ).toBe(false);
    },
  );

  it('does not claim successful delivery when SMTP is unconfigured', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([email])
      .mockResolvedValue([]);
    await new StaffProfileReviewNotificationService(
      { query } as never,
      { get: () => undefined } as never,
    ).deliverPending();
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(query.mock.calls[1][1][1]).toBe('EMAIL_NOT_CONFIGURED');
  });
});
