/** Shared queue limits apply across replicas using the same Redis namespace. */
export const notificationDeliveryLimiter = () => ({ max: 1, duration: 1_000 });

/** Durable database receipts, rather than indefinite Redis history, prevent replay. */
export const notificationJobRetention = () => ({
  removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
});
