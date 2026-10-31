const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateTarget,
  tableDefinition,
  registrarExtensions,
} = require('./bootstrap-hall-ticket-test-db');
const safe = {
  FALCON_TEST_DB: '1',
  FALCON_EMPTY_TEST_BOOTSTRAP: '1',
  TEST_DATABASE_URL:
    'postgres://test:fixture@127.0.0.1:55432/falcon_examcell_test',
};

test('reuses Registrar registration states without running unrelated seeds', () => {
  const statements = registrarExtensions();
  assert.equal(statements.length, 3);
  assert.match(statements.join('\n'), /registrar_remarks/);
  assert.match(statements.join('\n'), /SENT_BACK.*SUBMITTED/);
  for (const statement of statements) {
    assert.match(statement, /^ALTER TABLE exam_semester_registrations/);
    assert.doesNotMatch(statement, /INSERT INTO|UPDATE |DELETE FROM/);
  }
});

test('accepts only explicit disposable target and bootstrap flags', () => {
  assert.equal(validateTarget(safe), safe.TEST_DATABASE_URL);
  for (const override of [
    { FALCON_TEST_DB: '' },
    { FALCON_EMPTY_TEST_BOOTSTRAP: '' },
    { FALCON_RESET_DB: '1' },
    {
      TEST_DATABASE_URL: 'postgres://test@127.0.0.1:5433/university_governance',
    },
    { TEST_DATABASE_URL: safe.TEST_DATABASE_URL + '?host=production' },
    {
      TEST_DATABASE_URL: safe.TEST_DATABASE_URL.replace(
        '127.0.0.1',
        'localhost',
      ),
    },
  ])
    assert.throws(() => validateTarget({ ...safe, ...override }));
});

test('foundation extraction contains only the named original table DDL', () => {
  const sql = tableDefinition(
    '20260731120000_exam_cell_operations_modules.sql',
    'exam_semester_registrations',
  );
  assert.match(sql, /^CREATE TABLE IF NOT EXISTS exam_semester_registrations/);
  assert.doesNotMatch(sql, /INSERT INTO|UPDATE |DELETE FROM/);
  assert.throws(() =>
    tableDefinition(
      '20260731120000_exam_cell_operations_modules.sql',
      'nonexistent',
    ),
  );
});
