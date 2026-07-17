export type MockEmailPayload = {
  to: string;
  subject: string;
  body: string;
};

const sentEmails: MockEmailPayload[] = [];

export const mockEmailService = {
  send: jest.fn(async (payload: MockEmailPayload) => {
    sentEmails.push(payload);
    return { messageId: `mock-${sentEmails.length}` };
  }),
  getSent: () => [...sentEmails],
  reset: () => {
    sentEmails.length = 0;
    mockEmailService.send.mockClear();
  },
};

export const mockSmsService = {
  send: jest.fn(async (_phone: string, _message: string) => ({ sid: 'mock-sms' })),
  reset: () => mockSmsService.send.mockClear(),
};

export const mockPaymentGateway = {
  charge: jest.fn(async (_amount: number, _currency = 'INR') => ({
    id: 'mock-pay-id',
    status: 'captured',
  })),
  refund: jest.fn(async (_paymentId: string) => ({ status: 'refunded' })),
  reset: () => {
    mockPaymentGateway.charge.mockClear();
    mockPaymentGateway.refund.mockClear();
  },
};

/** Reset all external service mocks between tests. */
export function resetExternalMocks(): void {
  mockEmailService.reset();
  mockSmsService.reset();
  mockPaymentGateway.reset();
}
