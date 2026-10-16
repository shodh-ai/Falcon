'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { secretFor } = require('./seed.cjs');

test('Student override changes only the final Student password', () => {
  const master = 'fixture-only-master-not-a-real-password';
  const override = 'fixture-only-override-not-a-real-password';
  assert.equal(secretFor(master, 'student'), master);
  assert.equal(secretFor(master, 'student', false, override), override);
  assert.equal(secretFor(master, 'student', true, override), secretFor(master, 'student', true));
  for (const key of ['admin', 'approver', 'faculty', 'dean', 'examCell', 'control']) {
    assert.equal(secretFor(master, key, false, override), secretFor(master, key));
    assert.equal(secretFor(master, key, true, override), secretFor(master, key, true));
  }
});
