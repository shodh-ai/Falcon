// Creates and removes only its own synthetic local test database.
const {Client}=require('pg');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');const {randomUUID}=require('node:crypto');
const {buildManifest}=require('./pharmacy-timetable-2026');const {reconcile}=require('./import-pharmacy-timetable-2026');const {rollback}=require('./rollback-pharmacy-timetable-2026');
async function main(){
 const name=`falcon_timetable_test_${process.pid}_${Date.now()}`;
 const admin=new Client({host:'/tmp',database:'postgres'});await admin.connect();await admin.query(`CREATE DATABASE ${name}`);
 const c=new Client({host:'/tmp',database:name});
 try{await c.connect();await c.query(`
 CREATE TABLE tenants(tenant_id uuid PRIMARY KEY,subdomain text,is_active boolean);
 CREATE TABLE departments(dept_id int PRIMARY KEY,dept_name text);
 CREATE TABLE users(user_id uuid PRIMARY KEY,tenant_id uuid,official_email text,dept_id int,is_active boolean,deleted_at timestamptz,onboarding_status text);
 CREATE TABLE academic_faculty_load_declarations(tenant_id uuid,faculty_user_id uuid,status text,academic_year text);
 CREATE TABLE academic_courses(course_id uuid PRIMARY KEY,tenant_id uuid,course_code text,course_name text,deleted_at timestamptz);
 CREATE TABLE academic_subjects(subject_id serial PRIMARY KEY,subject_code text,deleted_at timestamptz,subject_name text);
 CREATE TABLE academic_course_allocations(allocation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,subject_id int,program_name text,semester text,faculty_user_id uuid,academic_year text,course_id uuid,status text,updated_at timestamptz DEFAULT now());
 CREATE UNIQUE INDEX active_allocation ON academic_course_allocations(tenant_id,subject_id,program_name,semester,academic_year,faculty_user_id) WHERE status='ACTIVE';
 CREATE TABLE academic_timetables(timetable_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,course_id uuid,day_of_week int,start_time time,end_time time,room text,faculty_user_id uuid,section text,deleted_at timestamptz);
 CREATE UNIQUE INDEX active_slot ON academic_timetables(tenant_id,course_id,day_of_week,start_time,end_time) WHERE deleted_at IS NULL;
 CREATE TABLE course_attendance_logs(log_id uuid PRIMARY KEY,tenant_id uuid,course_id uuid,faculty_user_id uuid,timetable_id uuid REFERENCES academic_timetables(timetable_id),date date,attendance_data jsonb);
 `);
 const tenant=randomUUID();await c.query("INSERT INTO tenants VALUES($1,'sgvu',true)",[tenant]);await c.query("INSERT INTO departments VALUES(43,'Pharmacy')");
 const manifest=buildManifest();const courses=new Map(),faculty=new Map();
 for(const code of new Set(manifest.entries.filter(e=>e.faculty_emails.length).map(e=>e.course_code))){const id=randomUUID();courses.set(code,id);await c.query('INSERT INTO academic_courses VALUES($1,$2,$3,$3,NULL)',[id,tenant,code]);await c.query('INSERT INTO academic_subjects(subject_code,subject_name) VALUES($1,$1)',[code]);}
 for(const email of new Set(manifest.entries.flatMap(e=>e.faculty_emails))){const id=randomUUID();faculty.set(email,id);await c.query("INSERT INTO users VALUES($1,$2,$3,43,true,NULL,'COMPLETED')",[id,tenant,email]);}
 const old=randomUUID(),actor=faculty.get('yogesh.matta@mygyanvihar.com'),course=courses.get('BP106T');
 await c.query("INSERT INTO academic_timetables VALUES($1,$2,$3,4,'09:00','10:00','LT-27',$4,'A',NULL)",[old,tenant,course,actor]);
 await c.query("INSERT INTO course_attendance_logs VALUES($1,$2,$3,$4,$5,'2026-10-01',$6)",[randomUUID(),tenant,course,actor,old,JSON.stringify([{student_id:'synthetic',status:'PRESENT'}])]);
 await c.query(fs.readFileSync(path.join(__dirname,'../migrations/20261014190000_pharmacy_timetable_publications.sql'),'utf8'));
 const history=(await c.query('SELECT * FROM course_attendance_logs')).rows;
 const dry=await reconcile(c,false);assert.equal(dry.confirmed,188);assert.equal(dry.held.length,12);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM academic_timetables')).rows[0].n,1);
 const applied=await reconcile(c,true);assert.ok(applied.publication_id);
 const {AcademicsFacultyService}=require('../dist/modules/academics/academics-faculty.service');
 const dataSource={query:async(sql,args)=>(await c.query(sql,args)).rows};
 const teaching={facultyCoursesCte:()=>`faculty_courses AS (SELECT course_id FROM academic_course_allocations WHERE tenant_id=$1 AND faculty_user_id=$2 AND status='ACTIVE' AND ($3::int IS NULL OR $3=43))`};
 const service=new AcademicsFacultyService(dataSource,{},{},{},{},{},{},{},teaching);
 service.getCourseStudents=async()=>[];
 const today=(await c.query('SELECT CURRENT_DATE::text AS date')).rows[0].date;
 const week=await service.getFacultyAttendanceWeek(actor,tenant,43,today);
 assert.equal(week.length,7);assert.equal(week.flatMap(d=>d.sessions).length,6); // Three theories plus three practicals.
 const shalu=faculty.get('shalu.jain@mygyanvihar.com');
 const nextTuesday=new Date(`${today}T12:00:00Z`);while(nextTuesday.getUTCDay()!==2)nextTuesday.setUTCDate(nextTuesday.getUTCDate()+1);
 const sessions=await service.getFacultyAcademicTimetableToday(shalu,tenant,43,nextTuesday.toISOString().slice(0,10));
 assert.ok(sessions.some(s=>s.course_code==='BP303T'&&s.start_time==='13:30:00'));
 assert.ok(sessions.some(s=>s.course_code==='BP307P'&&s.awaiting_confirmation));
 assert.ok(!sessions.some(s=>s.course_code==='ER2015P'));
 const otherTenant=await service.getFacultyAttendanceWeek(actor,randomUUID(),43,today);assert.equal(otherTenant.flatMap(d=>d.sessions).length,0);
 const otherDept=await service.getFacultyAttendanceWeek(actor,tenant,1,today);assert.equal(otherDept.flatMap(d=>d.sessions).length,0);
 const {FacultyWorkspacesService}=require('../dist/modules/academics/faculty-workspaces.service');
 const workspace=new FacultyWorkspacesService(dataSource,{},teaching,{});
 workspace.resolveHodDepartmentIds=async()=>[];
 const schedule=await workspace.getWeeklyTimetable(shalu,tenant,43);
 assert.equal(schedule.length,11);assert.equal(schedule.filter(s=>s.awaiting_confirmation).length,1);
 assert.ok(schedule.some(s=>s.course_code==='ER2015T'&&s.day_of_week===3&&s.start_time==='15:10:00'));
 await c.query(`ALTER TABLE users ADD COLUMN name text DEFAULT 'Synthetic faculty'; ALTER TABLE users ADD COLUMN role_id int DEFAULT 1;
   ALTER TABLE departments ADD COLUMN hod_user_id uuid; ALTER TABLE academic_courses ADD COLUMN credits numeric DEFAULT 1;
   ALTER TABLE academic_faculty_load_declarations ADD COLUMN reason text; ALTER TABLE academic_faculty_load_declarations ADD COLUMN revision int;
   CREATE TABLE roles(role_id int,role_name text); INSERT INTO roles VALUES(1,'Faculty');`);
 const {AcademicsService}=require('../dist/modules/academics/academics.service');
 const academics=Object.create(AcademicsService.prototype);academics.users={manager:dataSource};
 const loads=await academics.listFacultyWorkloadForDepartments(tenant,[43]);
 const load=loads.find(row=>row.user_id===shalu);assert.equal(load.pending_sessions,1);assert.equal(load.pending_minutes,210);
 assert.equal(load.scheduled_minutes,830);assert.equal(load.workload_status,'AWAITING_CONFIRMATION');
 assert.equal((await c.query('SELECT count(*)::int AS n FROM academic_timetables WHERE deleted_at IS NULL')).rows[0].n,188);
 assert.equal((await c.query('SELECT count(*)::int AS n FROM academic_timetable_source_entries')).rows[0].n,269);
 assert.deepEqual((await c.query('SELECT * FROM course_attendance_logs')).rows,history);
 assert.equal((await reconcile(c,true)).already_applied,true);
 await rollback(c,true);assert.equal((await c.query('SELECT timetable_id FROM academic_timetables WHERE deleted_at IS NULL')).rows[0].timetable_id,old);
 assert.deepEqual((await c.query('SELECT * FROM course_attendance_logs')).rows,history);
 console.log('PASS: dry run, atomic publication, 269 source entries, 12 held conflicts, idempotent replay, original attendance unchanged, rollback');
 }finally{await c.end();await admin.query(`DROP DATABASE ${name}`);await admin.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
