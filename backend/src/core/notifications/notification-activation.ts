type ReadConfiguration = (key: string) => unknown;

export function notificationQueuePrefix(read: ReadConfiguration): string {
  const prefix = read('PORTAL_NOTIFICATION_QUEUE_PREFIX');
  if (prefix === undefined || prefix === '') return 'bull';
  if (
    typeof prefix !== 'string' ||
    !/^falcon-notification-[a-z0-9-]{1,80}$/.test(prefix)
  ) {
    throw new Error('Notification queue prefix is invalid');
  }
  return prefix;
}

/** Keep the same prefix/cutover on restart. Never automatically replay old jobs. */
export function notificationActivation(
  read: ReadConfiguration,
  now = Date.now(),
) {
  const prefix = notificationQueuePrefix(read);
  const cutoff = read('PORTAL_NOTIFICATION_ACTIVATED_AFTER');
  const timestamp = typeof cutoff === 'string' ? Date.parse(cutoff) : NaN;
  if (
    prefix === 'bull' ||
    typeof cutoff !== 'string' ||
    !Number.isFinite(timestamp) ||
    timestamp > now ||
    timestamp < Date.UTC(2020, 0, 1) ||
    new Date(timestamp).toISOString() !== cutoff
  ) {
    throw new Error(
      'Explicit fresh notification queue and UTC cutover required',
    );
  }
  return { prefix, timestamp };
}
