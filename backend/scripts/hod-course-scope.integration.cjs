// Runs against TEMP tables in a local PostgreSQL connection; never modifies stored data.
const { Client } = require('pg');
const { randomUUID } = require('crypto');
const assert = require('node:assert/strict');
const { FacultyWorkspacesService } = require('../dist/modules/academics/faculty-workspaces.service');
const { FacultyTeachingDepartmentsService } = require('../dist/modules/academics/faculty-teaching-departments.service');
const { listDepartmentTimetable } = require('../dist/modules/academics/department-academic-queries');
const { CourseLmsService } = require('../dist/modules/academics/course-lms.service');
async function main() {
  const c = new Client({ host: process.env.PGHOST || '/tmp', database: 'postgres' });
  await c.connect();
  try {
    await c.query(`BEGIN;
      CREATE TEMP TABLE roles(role_id int, role_name text);
      CREATE TEMP TABLE departments(dept_id int, dept_name text, hod_user_id uuid, deleted_at timestamptz);
      CREATE TEMP TABLE users(user_id uuid, tenant_id uuid, dept_id int, role_id int, name text, deleted_at timestamptz);
      CREATE TEMP TABLE iam_programs(program_name text, program_code text, dept_id int, deleted_at timestamptz);
      CREATE TEMP TABLE academic_courses(course_id uuid, tenant_id uuid, course_code text, course_name text, credits int);
      CREATE TEMP TABLE academic_course_allocations(allocation_id uuid DEFAULT gen_random_uuid(), tenant_id uuid, course_id uuid, faculty_user_id uuid, program_name text, semester varchar, academic_year varchar, status text, updated_at timestamptz);
      CREATE TEMP TABLE student_course_enrollments(tenant_id uuid, course_id uuid, student_user_id uuid, status text);
      CREATE TEMP TABLE academic_timetables(timetable_id uuid DEFAULT gen_random_uuid(),tenant_id uuid,course_id uuid,faculty_user_id uuid,day_of_week int,start_time time,end_time time,room text,section text,deleted_at timestamptz,valid_from date);
      CREATE TEMP TABLE academic_timetable_source_entries(tenant_id uuid,course_id uuid,faculty_user_ids uuid[],entry jsonb,source_key text,publication_id uuid,state text);
      CREATE TEMP TABLE academic_timetable_publications(publication_id uuid,state text,activated_on date);
      INSERT INTO roles VALUES(1,'HOD'),(2,'Faculty');
      INSERT INTO iam_programs VALUES('B.Pharm','BPHARM',43,NULL),('Computer Science','BTECH',44,NULL);`);
    const tenant=randomUUID(), otherTenant=randomUUID(), hod=randomUUID(), teacher=randomUUID(), visiting=randomUUID(), student=randomUUID(), foreignStudent=randomUUID();
    await c.query(`INSERT INTO users(user_id,tenant_id,dept_id,role_id,name) VALUES
      ($1,$6,43,1,'HOD'),($2,$6,43,2,'Pharmacy Faculty'),($3,$6,44,2,'Visiting Faculty'),($4,$6,43,NULL,'Student'),($5,$7,43,NULL,'Foreign Student');
    `,[hod,teacher,visiting,student,foreignStudent,tenant,otherTenant]);
    await c.query(`INSERT INTO departments VALUES(43,'Pharmacy',$1,NULL),(44,'Computer Science',NULL,NULL)`,[hod]);
    const ids={};
    async function course(code, faculty, program, courseTenant=tenant) {
      const id=ids[code]=randomUUID();
      await c.query('INSERT INTO academic_courses VALUES($1,$2,$3,$3,4)',[id,courseTenant,code]);
      if(faculty) await c.query(`INSERT INTO academic_course_allocations(tenant_id,course_id,faculty_user_id,program_name,semester,academic_year,status) VALUES($1,$2,$3,$4,'I','2026-2027','ACTIVE')`,[courseTenant,id,faculty,program]);
      return id;
    }
    await course('OWN',hod,'BPHARM');
    await course('DEPT',teacher,'B.Pharm');
    await course('VISITING',visiting,'BPHARM');
    await course('UNRELATED',teacher,'BTECH'); // teacher's home dept must not expose this
    await course('LEGACY',teacher,null);
    await course('ENROLLED',visiting,'BTECH');
    await course('FORMER',visiting,'BTECH');
    await course('FOREIGN',visiting,'BTECH');
    await course('OTHER-TENANT',teacher,'BPHARM',otherTenant);
    await c.query(`INSERT INTO student_course_enrollments VALUES($1,$2,$3,'ENROLLED'),($1,$4,$3,'COMPLETED'),($1,$5,$6,'ENROLLED')`,[tenant,ids.ENROLLED,student,ids.FORMER,ids.FOREIGN,foreignStudent]);
    for(const code of ['OWN','DEPT','UNRELATED']) await c.query(`INSERT INTO academic_timetables(tenant_id,course_id,faculty_user_id,day_of_week,start_time,end_time) VALUES($1,$2,$3,1,'09:00','10:00')`,[tenant,ids[code],code==='OWN'?hod:teacher]);
    const ds={query:async(sql,args)=>(await c.query(sql,args)).rows};
    const service=new FacultyWorkspacesService(ds,{},new FacultyTeachingDepartmentsService(ds),{});
    const rows=await service.listFacultyCourses(hod,tenant,null,true);
    assert.deepEqual([...new Set(rows.map(r=>r.course_code))].sort(),['DEPT','ENROLLED','LEGACY','OWN','VISITING']);
    assert.deepEqual((await service.getWeeklyTimetable(hod,tenant)).map(r=>r.course_code),['OWN']);
    const departmentSchedule = await service.getFacultyScheduleData(hod,tenant);
    assert.deepEqual([...new Set(departmentSchedule.allocations.map(r=>r.course_code))].sort(),['DEPT','ENROLLED','LEGACY','OWN','VISITING']);
    assert.deepEqual(departmentSchedule.timetables.map(r=>r.course_code).sort(),['DEPT','OWN']);
    const departmentTimetable = await listDepartmentTimetable(ds.query,tenant,[43],'2026-2027');
    assert.deepEqual(departmentTimetable.map(r=>r.course_code).sort(),['DEPT','OWN']);
    const lms=Object.create(CourseLmsService.prototype);
    lms.dataSource=ds;
    lms.getCourseOrFail=async()=>{}; // membership is tested against the real SQL gate below
    for(const code of ['OWN','DEPT','ENROLLED','VISITING']) await lms.assertHodCourseScope(ids[code],hod,tenant);
    for(const code of ['UNRELATED','FORMER','FOREIGN','OTHER-TENANT']) await assert.rejects(lms.assertHodCourseScope(ids[code],hod,tenant),/Course not found in your department/);
    await assert.rejects(service.listFacultyCourses(hod,tenant,44,true),/outside your oversight scope/);
    assert.deepEqual(await service.listFacultyCourses(hod,otherTenant,null,true),[]);
    console.log('PASS: own timetable; programme department; visiting faculty; current vs former enrollment; tenant isolation; direct course access; unauthorized department.');
  } finally { await c.query('ROLLBACK'); await c.end(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
