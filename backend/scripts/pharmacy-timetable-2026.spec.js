const {test}=require('node:test');const assert=require('node:assert/strict');
const {buildManifest}=require('./pharmacy-timetable-2026');
test('eight source pages, unique provenance and valid exact durations',()=>{
  const m=buildManifest();assert.equal(Object.keys(m.pages).length,8);assert.equal(m.entries.length,269);
  assert.equal(new Set(m.entries.map(e=>e.source_key)).size,m.entries.length);
  for(const e of m.entries){assert.ok(e.start<e.end);assert.ok(['HELD','CONFIRMED','ACTIVITY'].includes(e.state));}
});
test('confirmed teaching entries have no instructor or batch overlap',()=>{
  const entries=buildManifest().entries.filter(e=>e.state==='CONFIRMED');
  for(const a of entries)for(const b of entries){if(a.source_key===b.source_key||a.day!==b.day||a.start>=b.end||b.start>=a.end)continue;
    assert.ok(!a.faculty_emails.some(email=>b.faculty_emails.includes(email)),`${a.source_key}/${b.source_key}`);
    assert.ok(a.programme!==b.programme||a.term!==b.term||a.batch!=='ALL'&&b.batch!=='ALL'&&a.batch!==b.batch);
  }
});
test('Shalu corrected Wednesday, Tuesday visibility and unresolved microbiology retained',()=>{
  const e=buildManifest().entries.filter(e=>e.faculty_emails.includes('shalu.jain@mygyanvihar.com'));
  assert.ok(e.some(x=>x.course_code==='ER2015T'&&x.day===3&&x.start==='15:10'));
  assert.ok(e.some(x=>x.course_code==='BP303T'&&x.day===2&&x.start==='13:30'&&x.state==='CONFIRMED'));
  assert.equal(e.filter(x=>x.course_code==='BP307P').length,3);
  assert.equal(e.find(x=>x.course_code==='BP307P'&&x.day===2).state,'HELD');
  assert.ok(!e.some(x=>x.course_code==='ER2015P'));
});
test('confirmed identities and co-teachers preserved without inventing student batches',()=>{
  const m=buildManifest();assert.ok(m.entries.filter(e=>e.course_code==='MPH106P').every(e=>e.faculty_emails[0]==='manish.gupta@mygyanvihar.com'));
  assert.ok(m.entries.filter(e=>e.course_code==='ER2015P').every(e=>e.faculty_emails[0]==='samarpan.mishra@mygyanvihar.com'));
  assert.ok(m.entries.some(e=>e.course_code==='BP706PS'&&e.faculty_emails.length===2));
  assert.ok(m.entries.filter(e=>e.page===6&&e.faculty_emails.length).every(e=>e.faculty_emails[0]==='abha.mishra@mygyanvihar.com'));
  assert.ok(!JSON.stringify(m).includes('student_id'));
});
