// Explicit projection rollback; never deletes attendance, slots, or source evidence.
const { Client } = require('pg');
const { REVISION } = require('./import-pharmacy-timetable-2026');
async function rollback(client, apply=false) {
  await client.query(apply?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN READ ONLY');
  try {
    const {rows}=await client.query(`SELECT p.* FROM academic_timetable_publications p JOIN public.tenants t ON t.tenant_id=p.tenant_id
      WHERE t.subdomain='sgvu' AND p.revision=$1 AND p.state='ACTIVE'`,[REVISION]);
    if(rows.length!==1) throw new Error('Expected exactly one active reviewed publication');
    const p=rows[0];
    if(!apply) { await client.query('ROLLBACK');return {publication_id:p.publication_id,restore_slots:p.snapshot.slots.length,apply:false}; }
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${p.tenant_id}:${REVISION}`]);
    await client.query('UPDATE academic_timetables SET deleted_at=now(),valid_to=CURRENT_DATE WHERE tenant_id=$1 AND publication_id=$2 AND deleted_at IS NULL',[p.tenant_id,p.publication_id]);
    const courseIds=[...new Set(p.manifest.entries.map(e=>e.course_id).filter(Boolean))];
    await client.query("UPDATE academic_course_allocations SET status='SUPERSEDED',updated_at=now() WHERE tenant_id=$1 AND academic_year='2026-2027' AND course_id=ANY($2::uuid[]) AND status='ACTIVE'",[p.tenant_id,courseIds]);
    for(const row of p.snapshot.slots) await client.query('UPDATE academic_timetables SET deleted_at=$3,valid_from=$4,valid_to=$5 WHERE tenant_id=$1 AND timetable_id=$2',[p.tenant_id,row.timetable_id,row.deleted_at,row.valid_from,row.valid_to]);
    for(const row of p.snapshot.allocations) await client.query('UPDATE academic_course_allocations SET status=$3,updated_at=now() WHERE tenant_id=$1 AND allocation_id=$2',[p.tenant_id,row.allocation_id,row.status]);
    await client.query("UPDATE academic_timetable_publications SET state='ROLLED_BACK' WHERE publication_id=$1",[p.publication_id]);
    await client.query('COMMIT');return {publication_id:p.publication_id,rolled_back:true};
  }catch(error){await client.query('ROLLBACK');throw error;}
}
if(require.main===module){
  const client=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE||'university_governance'});
  client.connect().then(()=>rollback(client,process.argv.includes('--apply'))).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>client.end());
}
module.exports={rollback};
