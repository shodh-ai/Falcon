const { test } = require('node:test');
const assert = require('node:assert/strict');
const { approvedSids } = require('./pharmacy-student-email-mapping');
test('only the 151 approved SIDs, never the rejected row', () => {
  const ids = approvedSids();
  assert.equal(ids.length, 151);
  assert.equal(new Set(ids).size, 151);
  assert(!ids.includes('2646383'));
});
