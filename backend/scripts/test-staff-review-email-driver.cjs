// Real TypeORM/PostgreSQL contract test; all mail is mocked and all data is TEMP.
// FALCON_TEST_DB=1 DB_HOST=/tmp DB_USERNAME=<local-user> DB_DATABASE=postgres node scripts/test-staff-review-email-driver.cjs
const assert = require('node:assert/strict');
const { DataSource } = require('typeorm');
const nodemailer = require('nodemailer');

async function main() {
  if (process.env.FALCON_TEST_DB !== '1' || !['/tmp', 'localhost', '127.0.0.1'].includes(process.env.DB_HOST)) {
    throw new Error('Explicit local test database required; production is prohibited');
  }
  const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432), username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE || 'postgres',
    entities: [], synchronize: false, logging: false });
  await db.initialize();
  const qr = db.createQueryRunner();
  const originalTransport = nodemailer.createTransport;
  const sent = [];
  let fail = false;
  nodemailer.createTransport = () => ({ sendMail: async (message) => {
    if (fail) throw new Error('Mock SMTP unavailable');
    sent.push(message);
    return { accepted: [message.to], rejected: [] };
  } });
  const { StaffProfileReviewNotificationService } = require('../dist/modules/student-onboarding/staff-profile-review-notification.service');
  try {
    await qr.connect();
    await qr.startTransaction();
    await qr.query(`CREATE TEMP TABLE staff_profile_review_email_outbox (
      notification_id uuid PRIMARY KEY, recipient_email text, action_path text,
      payload jsonb, status text, attempts int DEFAULT 0, next_attempt_at timestamptz DEFAULT NOW(),
      created_at timestamptz DEFAULT NOW(), sent_at timestamptz, last_error text
    ) ON COMMIT DROP`);
    const id = '10000000-0000-4000-8000-000000000001';
    await qr.query(`INSERT INTO staff_profile_review_email_outbox
      (notification_id,recipient_email,action_path,payload,status)
      VALUES ($1,$2,$3,$4::jsonb,'PENDING')`, [id, 'test@example.invalid', '/faculty/dashboard', JSON.stringify({ reason: 'Synthetic correction test', fields: ['staff_mobile'], documents: [] })]);
    const query = (sql, params) => qr.query(sql, params);
    const service = new StaffProfileReviewNotificationService({ query }, { get: (key) => ({ EMAIL_HOST: 'mock.invalid', FRONTEND_URL: 'https://example.invalid' })[key] });
    await service.deliverPending();
    let [row] = await qr.query('SELECT * FROM staff_profile_review_email_outbox');
    assert.equal(row.status, 'SENT');
    assert.equal(row.attempts, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'test@example.invalid');
    assert.equal(sent[0].messageId, `<staff-review-${id}@falcon.jataka.io>`);
    await service.deliverPending();
    assert.equal(sent.length, 1, 'Already-sent mail must not be resent');
    fail = true;
    await qr.query(`UPDATE staff_profile_review_email_outbox SET status='PENDING', attempts=0, next_attempt_at=NOW(), sent_at=NULL`);
    await service.deliverPending();
    [row] = await qr.query('SELECT * FROM staff_profile_review_email_outbox');
    assert.equal(row.status, 'RETRY');
    assert.equal(row.last_error, 'EMAIL_DELIVERY_FAILED');
    assert.equal(row.attempts, 1);
    assert.ok(row.next_attempt_at instanceof Date);
    fail = false;
    await qr.query(`UPDATE staff_profile_review_email_outbox SET status='SENDING',next_attempt_at=NOW()-INTERVAL '1 minute'`);
    await service.deliverPending();
    [row] = await qr.query('SELECT * FROM staff_profile_review_email_outbox');
    assert.equal(row.status, 'SENT');
    assert.equal(row.attempts, 2);
    assert.equal(sent.length, 2);
    console.log('PASS: real PostgreSQL/TypeORM claim, empty queue, idempotent send, finite retry and expired-lease recovery. No real email sent.');
  } finally {
    nodemailer.createTransport = originalTransport;
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    await qr.release();
    await db.destroy();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
