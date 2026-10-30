import { randomUUID } from 'crypto';
import {
  constants,
  mkdirSync,
  openSync,
  closeSync,
  writeFileSync,
  lstatSync,
} from 'fs';
import type { DataSource } from 'typeorm';
import { isVerifiedStaging } from './staging-environment';

/** Local receipts only. Never imports a provider SDK or opens a network socket. */
export function captureStagingIntegration(
  kind: string,
  payload: unknown,
): void {
  if (!isVerifiedStaging()) throw new Error('STAGING_MOCK_BOUNDARY');
  if (!/^[a-z-]{2,40}$/.test(kind)) throw new Error('STAGING_MOCK_KIND');
  const directory = '/app/uploads/.staging-integrations';
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (
    !lstatSync(directory).isDirectory() ||
    lstatSync(directory).isSymbolicLink()
  ) {
    throw new Error('STAGING_MOCK_DIRECTORY');
  }
  const receipt = JSON.stringify({
    environment: 'staging',
    mock: true,
    kind,
    captured_at: new Date().toISOString(),
    payload,
  });
  if (Buffer.byteLength(receipt) > 1024 * 1024)
    throw new Error('STAGING_MOCK_SIZE');
  const fd = openSync(
    `${directory}/${randomUUID()}.json`,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(fd, receipt);
  } finally {
    closeSync(fd);
  }
}

const OUTBOXES = new Set([
  'acq_outbox_events',
  'proc_outbox_events',
  'con_outbox_events',
  'inv_outbox_events',
  'svc_outbox_events',
  'pix_outbox_events',
  'inv_integrity_outbox_events',
  'ret_outbox_events',
  'retirement_outbox_events',
  'pv_outbox_events',
]);

/** Preserve the payload in a local mock receipt before acknowledging staging work. */
export async function publishStagingOutbox(
  db: DataSource,
  table: string,
): Promise<boolean> {
  if (!isVerifiedStaging()) return false;
  if (!OUTBOXES.has(table)) throw new Error('STAGING_MOCK_OUTBOX');
  await db.transaction(async (manager) => {
    const events: Array<{ event_id: string; payload: unknown }> =
      await manager.query(
        `SELECT event_id,payload FROM ${table} WHERE status IN ('PENDING','FAILED')
       AND available_at<=NOW() ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED`,
      );
    for (const event of events) {
      captureStagingIntegration('webhook', { table, event });
      await manager.query(
        `UPDATE ${table} SET status='PUBLISHED',published_at=NOW(),
        attempts=attempts+1,last_error=NULL WHERE event_id=$1`,
        [event.event_id],
      );
    }
  });
  return true;
}
