/* Default is read-only dry run. Never imports passwords, students or attendance. */
const { Client } = require('pg');
const { buildManifest } = require('./pharmacy-timetable-2026');
const REVISION = 'pharmacy-jul-dec-2026-reviewed-v1';
async function reconcile(client, apply = false) {
  const manifest = buildManifest();
  await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY');
  try {
    const tenants = await client.query("SELECT tenant_id FROM public.tenants WHERE subdomain='sgvu' AND is_active=true");
    if (tenants.rows.length !== 1) throw new Error('Expected exactly one active sgvu tenant');
    const tenant = tenants.rows[0].tenant_id;
    if (apply) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${tenant}:${REVISION}`]);
    const previous = await client.query('SELECT publication_id,state FROM academic_timetable_publications WHERE tenant_id=$1 AND revision=$2', [tenant, REVISION]);
    if (previous.rows.length) {
      if (previous.rows[0].state !== 'ACTIVE') throw new Error('Revision was rolled back; prepare a new reviewed revision');
      await client.query('ROLLBACK'); return { already_applied: true, publication_id: previous.rows[0].publication_id };
    }
    const codes = [...new Set(manifest.entries.filter(e => e.faculty_emails.length).map(e => e.course_code))];
    const emails = [...new Set(manifest.entries.flatMap(e => e.faculty_emails))];
    const courses = await client.query('SELECT course_id,course_code,course_name FROM academic_courses WHERE tenant_id=$1 AND course_code=ANY($2) AND deleted_at IS NULL', [tenant,codes]);
    const faculty = await client.query(`SELECT u.user_id,lower(u.official_email) AS email FROM users u JOIN departments d ON d.dept_id=u.dept_id
      WHERE u.tenant_id=$1 AND lower(u.official_email)=ANY($2) AND u.is_active=true AND u.deleted_at IS NULL AND lower(d.dept_name)='pharmacy'`, [tenant,emails]);
    const subjects = await client.query('SELECT subject_id,subject_code,subject_name FROM academic_subjects WHERE subject_code=ANY($1) AND deleted_at IS NULL', [codes]);
    const resolve = (rows,key,value) => {
      const matches = rows.filter(row => row[key]===value);
      if (matches.length !== 1) throw new Error(`Unresolved or ambiguous ${key}: ${value} (${matches.length})`);
      return matches[0];
    };
    for (const entry of manifest.entries.filter(e => e.faculty_emails.length)) {
      entry.course_id = resolve(courses.rows,'course_code',entry.course_code).course_id;
      entry.subject_id = resolve(subjects.rows,'subject_code',entry.course_code).subject_id;
      const normalize=name=>String(name).toLowerCase().replace(/[^a-z0-9]/g,'');
      if(normalize(resolve(courses.rows,'course_code',entry.course_code).course_name)!==normalize(resolve(subjects.rows,'subject_code',entry.course_code).subject_name)) {
        throw new Error(`Course/catalogue meaning mismatch: ${entry.course_code}; reconcile explicitly before publication`);
      }
      entry.faculty_user_ids = entry.faculty_emails.map(email => resolve(faculty.rows,'email',email).user_id);
      if (entry.state==='CONFIRMED' && entry.faculty_user_ids.length !== 1) throw new Error('Shared publication requires explicit multi-teacher slot support');
    }
    const ids = courses.rows.map(c=>c.course_id);
    const slots = await client.query('SELECT * FROM academic_timetables WHERE tenant_id=$1 AND course_id=ANY($2) AND deleted_at IS NULL ORDER BY timetable_id', [tenant,ids]);
    const allocations = await client.query(`SELECT * FROM academic_course_allocations WHERE tenant_id=$1 AND course_id=ANY($2)
      AND academic_year='2026-2027' AND status='ACTIVE' ORDER BY allocation_id`, [tenant,ids]);
    const report = { revision:REVISION, source_sha256:manifest.source_sha256, apply, old_slots:slots.rows.length,
      confirmed:manifest.entries.filter(e=>e.state==='CONFIRMED').length,
      held:manifest.entries.filter(e=>e.state==='HELD'), activities:manifest.entries.filter(e=>e.state==='ACTIVITY').length,
      faculty:emails.length, history_policy:'Existing attendance rows and original slot IDs are not updated.' };
    const officialEmails=[...emails,...['nidhi.chauhan','nisha.yadav','preeti.khulbe','shikha.kandpal','gauri.gupta'].map(local=>`${local}@mygyanvihar.com`)];
    const audit=await client.query(`SELECT lower(u.official_email) AS email,u.is_active,u.onboarding_status,
      d.status AS load_declaration FROM users u LEFT JOIN academic_faculty_load_declarations d ON d.tenant_id=u.tenant_id AND d.faculty_user_id=u.user_id AND d.academic_year='2026-2027'
      WHERE u.tenant_id=$1 AND lower(u.official_email)=ANY($2) AND u.deleted_at IS NULL`,[tenant,officialEmails]);
    report.faculty_audit=officialEmails.map(email=>({email,accounts:audit.rows.filter(u=>u.email===email),
      confirmed_sessions:manifest.entries.filter(e=>e.state==='CONFIRMED'&&e.faculty_emails.includes(email)).length,
      held_sessions:manifest.entries.filter(e=>e.state==='HELD'&&e.faculty_emails.includes(email)).length,
      absent_from_source:!emails.includes(email)}));
    if (!apply) { await client.query('ROLLBACK'); return report; }
    const date = (await client.query('SELECT CURRENT_DATE::text AS date')).rows[0].date;
    const inserted = await client.query(`INSERT INTO academic_timetable_publications(tenant_id,source_sha256,revision,activated_on,state,manifest,snapshot)
      VALUES($1,$2,$3,$4,'ACTIVE',$5,$6) RETURNING publication_id`, [tenant,manifest.source_sha256,REVISION,date,JSON.stringify(manifest),JSON.stringify({slots:slots.rows,allocations:allocations.rows})]);
    const publication = inserted.rows[0].publication_id;
    // Retain original records (including all referenced attendance slots).
    await client.query('UPDATE academic_timetables SET deleted_at=now(),valid_to=$3::date-1 WHERE tenant_id=$1 AND timetable_id=ANY($2::uuid[])', [tenant,slots.rows.map(s=>s.timetable_id),date]);
    await client.query("UPDATE academic_course_allocations SET status='SUPERSEDED',updated_at=now() WHERE tenant_id=$1 AND allocation_id=ANY($2::uuid[])", [tenant,allocations.rows.map(a=>a.allocation_id)]);
    const allocated = new Set();
    for (const entry of manifest.entries) {
      for (const userId of entry.faculty_user_ids || []) {
        const key=`${entry.course_id}:${entry.programme}:${entry.term}:${userId}`;
        if (allocated.has(key)) continue;
        await client.query(`INSERT INTO academic_course_allocations(tenant_id,subject_id,program_name,semester,faculty_user_id,academic_year,course_id,status)
          VALUES($1,$2,$3,$4,$5,'2026-2027',$6,'ACTIVE')`, [tenant,entry.subject_id,entry.programme,entry.term,userId,entry.course_id]);
        allocated.add(key);
      }
      let slotId = null;
      if (entry.state==='CONFIRMED') {
        const slot = await client.query(`INSERT INTO academic_timetables(tenant_id,course_id,day_of_week,start_time,end_time,room,faculty_user_id,section,valid_from,publication_id)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING timetable_id`,
          [tenant,entry.course_id,entry.day,entry.start,entry.end,entry.room,entry.faculty_user_ids[0],entry.batch==='ALL'?'A':`BATCH-${entry.batch}`,date,publication]);
        slotId=slot.rows[0].timetable_id;
      }
      await client.query(`INSERT INTO academic_timetable_source_entries(publication_id,source_key,tenant_id,course_id,faculty_user_ids,state,entry,timetable_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [publication,entry.source_key,tenant,entry.course_id||null,entry.faculty_user_ids||[],entry.state,JSON.stringify(entry),slotId]);
    }
    await client.query('COMMIT'); return {...report,publication_id:publication,activated_on:date};
  } catch(error) { await client.query('ROLLBACK'); throw error; }
}
if (require.main===module) {
  const client=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||process.env.DB_USER,
    password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE||'university_governance'});
  client.connect().then(()=>reconcile(client,process.argv.includes('--apply'))).then(report=>console.log(JSON.stringify(report,null,2)))
    .catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>client.end());
}
module.exports={reconcile,REVISION};
