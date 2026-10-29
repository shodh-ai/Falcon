const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes } = require('node:crypto');
const { test } = require('node:test');

const enabled = process.env.FALCON_RUN_STUDENT_ATTENDANCE_SQL_TESTS === '1';

test(
  'legacy attendance indexes preserve exact session identity',
  { skip: !enabled },
  async (t) => {
    const { Client } = require('pg');
    const env = process.env;
    assert.equal(env.NODE_ENV, 'test');
    assert.ok(['127.0.0.1', 'localhost', '::1'].includes(env.DB_HOST));
    const localQa =
      env.DB_PORT === '5436' &&
      /^falcon_student_qa_\d{8}$/.test(env.DB_DATABASE || '');
    const ciFixture =
      env.FALCON_TEST_DB === '1' &&
      env.DB_PORT === '5432' &&
      env.DB_DATABASE === 'falcon_test';
    assert.ok(
      localQa || ciFixture,
      'Only the explicit local QA or disposable CI database is allowed',
    );
    const config = {
      host: env.DB_HOST,
      port: Number(env.DB_PORT),
      user: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_DATABASE,
    };
    const owner = new Client(config);
    await owner.connect();
    const previous = fs.readFileSync(
      path.join(
        __dirname,
        '../migrations/20261028100000_extra_class_attendance_identity.sql',
      ),
      'utf8',
    );
    const migration = fs.readFileSync(
      path.join(
        __dirname,
        '../migrations/20261028110000_retire_legacy_attendance_day_uniqueness.sql',
      ),
      'utf8',
    );

    async function fixture(run) {
      const database = `falcon_student_attendance_test_${randomBytes(8).toString('hex')}`;
      assert.match(database, /^falcon_student_attendance_test_[a-f0-9]{16}$/);
      await owner.query(`CREATE DATABASE "${database}"`);
      const db = new Client({ ...config, database });
      try {
        await db.connect();
        await db.query(`
        CREATE TABLE class_adjustments (adjustment_id UUID PRIMARY KEY);
        CREATE TABLE course_attendance_logs (
          log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL, course_id UUID NOT NULL,
          faculty_user_id UUID NOT NULL, date DATE NOT NULL,
          timetable_id UUID,
          CONSTRAINT legacy_constraint_other_environment_name
            UNIQUE (tenant_id, course_id, faculty_user_id, date),
          CONSTRAINT unrelated_rule UNIQUE (log_id, tenant_id)
        );
        CREATE UNIQUE INDEX generated_index_other_environment_name
          ON course_attendance_logs (course_id, date, tenant_id, faculty_user_id);
      `);
        await run(db);
      } finally {
        await db.end();
        // This exact name was generated and created above, never supplied by an operator.
        assert.match(database, /^falcon_student_attendance_test_[a-f0-9]{16}$/);
        await owner.query(`DROP DATABASE "${database}"`);
      }
    }

    try {
      assert.equal(
        (await owner.query('SELECT current_database() AS name')).rows[0].name,
        config.database,
      );
      await t.test(
        'regular, extra and distinct regular sessions coexist without duplicate identities',
        async () => {
          await fixture(async (db) => {
            await db.query(previous);
            const tenant = randomUUID(),
              course = randomUUID(),
              faculty = randomUUID();
            const first = randomUUID(),
              second = randomUUID(),
              extra = randomUUID();
            await db.query('INSERT INTO class_adjustments VALUES ($1)', [
              extra,
            ]);
            const insert = (timetable, adjustment) =>
              db.query(
                `INSERT INTO course_attendance_logs
             (tenant_id,course_id,faculty_user_id,date,timetable_id,class_adjustment_id)
           VALUES ($1,$2,$3,'2026-10-27',$4,$5)`,
                [tenant, course, faculty, timetable, adjustment],
              );
            await insert(first, null);
            await assert.rejects(insert(null, extra), { code: '23505' });
            await db.query(migration);
            await db.query(migration); // Idempotent; never re-credit or rewrite attendance.
            assert.equal(
              (
                await db.query(
                  'SELECT COUNT(*)::int AS count FROM course_attendance_logs',
                )
              ).rows[0].count,
              1,
            );
            await insert(null, extra);
            await insert(second, null);
            await assert.rejects(insert(first, null), { code: '23505' });
            await assert.rejects(insert(null, extra), { code: '23505' });
            await assert.rejects(insert(first, extra), { code: '23514' });
            await insert(null, null);
            await assert.rejects(insert(null, null), { code: '23505' });
            assert.equal(
              (
                await db.query(
                  "SELECT COUNT(*)::int AS count FROM pg_constraint WHERE conrelid='course_attendance_logs'::regclass AND conname='unrelated_rule'",
                )
              ).rows[0].count,
              1,
            );
          });
        },
      );

      await t.test(
        'missing exact-session protection fails before removing legacy protection',
        async () => {
          await fixture(async (db) => {
            await db.query(previous);
            await db.query(
              'DROP INDEX idx_course_attendance_logs_session_unique',
            );
            await assert.rejects(
              db.query(migration),
              /Exact-session attendance uniqueness/,
            );
            assert.notEqual(
              (
                await db.query(
                  "SELECT to_regclass('generated_index_other_environment_name')::text AS name",
                )
              ).rows[0].name,
              null,
            );
          });
        },
      );

      await t.test(
        'unexpected foreign-key dependencies stop migration without cascading',
        async () => {
          await fixture(async (db) => {
            await db.query(previous);
            await db.query(`CREATE TABLE dependent_fixture (
          tenant_id UUID, course_id UUID, faculty_user_id UUID, date DATE,
          FOREIGN KEY (tenant_id,course_id,faculty_user_id,date)
            REFERENCES course_attendance_logs (tenant_id,course_id,faculty_user_id,date)
        )`);
            await assert.rejects(db.query(migration), { code: '2BP01' });
            assert.notEqual(
              (
                await db.query(
                  "SELECT to_regclass('generated_index_other_environment_name')::text AS name",
                )
              ).rows[0].name,
              null,
            );
            assert.notEqual(
              (
                await db.query(
                  "SELECT to_regclass('dependent_fixture')::text AS name",
                )
              ).rows[0].name,
              null,
            );
          });
        },
      );
    } finally {
      await owner.end();
    }
  },
);
