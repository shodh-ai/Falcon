import {
  notificationDeliveryLimiter,
  notificationJobRetention,
} from './notification-delivery-policy';

describe('notification queue operating limits', () => {
  it('uses a conservative shared one-message-per-second ceiling', () => {
    expect(notificationDeliveryLimiter()).toEqual({ max: 1, duration: 1000 });
  });
  it('bounds completed and failed job history by age and count', () => {
    expect(notificationJobRetention()).toEqual({
      removeOnComplete: { age: 604800, count: 10000 },
      removeOnFail: { age: 604800, count: 5000 },
    });
  });
  it('returns independent settings so callers cannot mutate another worker', () => {
    const options = notificationDeliveryLimiter();
    options.max = 10;
    const retention = notificationJobRetention();
    retention.removeOnComplete.count = 1;
    expect(notificationDeliveryLimiter().max).toBe(1);
    expect(notificationJobRetention().removeOnComplete.count).toBe(10000);
  });
});
