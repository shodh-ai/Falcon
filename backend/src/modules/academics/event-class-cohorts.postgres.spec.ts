import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';
import { AcademicsFacultyService } from './academics-faculty.service';
import { attendanceReopening } from './attendance-reopening';
import { eventExemptions, assertNoEventExemption } from './event-class-cohorts';
import { GatePassVerificationController } from '../hr/gate-pass-verification.controller';
import { regularizationRoute } from '../hr/regularization-route';

jest.mock('uuid',()=>({v4:()=>require('crypto').randomUUID()}));
const suite=process.env.FALCON_TEST_DB==='1'?describe:describe.skip;
suite('Event cohort and reopening authority (isolated PostgreSQL)',()=>{
  const schema=`event_cohort_${randomUUID().replace(/-/g,'')}`;
  const tenant=randomUUID(),faculty=randomUUID(),hod=randomUUID(),coordinator=randomUUID(),student=randomUUID(),course=randomUUID(),slot=randomUUID(),event=randomUUID(),club=randomUUID(),hr=randomUUID();
  let client:Client,service:AcademicsFacultyService,created=false,date:string;
  const query=async(sql:string,args:unknown[]=[]) => (await client.query(sql,args)).rows;
  const transaction=async(fn:any)=>{await client.query('BEGIN');try{const result=await fn({query});await client.query('COMMIT');return result;}catch(e){await client.query('ROLLBACK');throw e;}};
  beforeAll(async()=>{
    const url=new URL(process.env.TEST_DATABASE_URL||'http://invalid');
    if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!=='/falcon_examcell_test')throw new Error('Local disposable database required');
    client=new Client({connectionString:url.toString()});await client.connect();
    const marker=await query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=current_database()");
    if(marker[0]?.marker!=='falcon-examcell-disposable-integration-20261021')throw new Error('Disposable database marker required');
    await query(`CREATE SCHEMA ${schema}`);created=true;await query(`SET search_path TO ${schema}`);
    await query(`CREATE TABLE tenants(tenant_id uuid PRIMARY KEY);
      CREATE TABLE users(user_id uuid PRIMARY KEY,tenant_id uuid,dept_id int,is_active boolean DEFAULT true,deleted_at timestamptz,name text,role_id int,entity_id int,created_at timestamptz DEFAULT now());
      CREATE TABLE departments(dept_id int PRIMARY KEY,hod_user_id uuid,school_id int,dept_name text); CREATE TABLE schools(school_id int,campus_id int); CREATE TABLE hierarchy_assignments(user_id uuid,entity_type text,entity_id text);
      CREATE TABLE roles(role_id int,role_name text); CREATE TABLE user_roles(user_id uuid,role_id int);
      CREATE TABLE hr_access_controls(tenant_id uuid,user_id uuid,module_name text,can_view boolean,can_approve boolean,department_scope int[],entity_scope int[]);
      CREATE TABLE hr_employee_profiles(tenant_id uuid,user_id uuid,entity_id int,employee_id text);
      CREATE TABLE department_leadership(tenant_id uuid,dept_id int,structure text,revision int);
      CREATE TABLE department_offices(office_id uuid,tenant_id uuid,dept_id int,kind text);
      CREATE TABLE department_office_appointments(office_id uuid,user_id uuid,valid_to timestamptz,valid_from timestamptz);
      CREATE TABLE academic_courses(course_id uuid PRIMARY KEY,tenant_id uuid,course_code text,course_name text);
      CREATE TABLE academic_timetables(timetable_id uuid PRIMARY KEY,tenant_id uuid,course_id uuid,faculty_user_id uuid,day_of_week int,start_time time,end_time time,section text,room text,valid_from date,valid_to date,deleted_at timestamptz);
      CREATE TABLE campus_clubs(club_id uuid PRIMARY KEY,tenant_id uuid,faculty_advisor_id uuid);
      CREATE TABLE campus_events(event_id uuid PRIMARY KEY,tenant_id uuid,club_id uuid,title text,event_date timestamptz,status text,advisor_approval text,hod_approval text,dean_approval text,estate_approval text,finance_approval text,funds_needed numeric);
      CREATE TABLE academic_class_moves(tenant_id uuid,source_timetable_id uuid,source_date date,target_date date,status text);
      CREATE TABLE academic_proxy_requests(tenant_id uuid,timetable_id uuid,date_of_proxy date,status text);
      CREATE TABLE class_adjustments(tenant_id uuid,course_id uuid,adjustment_type text,status text,new_date timestamptz);
      CREATE TABLE course_attendance_logs(tenant_id uuid,course_id uuid,faculty_user_id uuid,date date,timetable_id uuid,attendance_data jsonb,marked_by_user_id uuid);
      CREATE TABLE student_course_enrollments(tenant_id uuid,course_id uuid,student_user_id uuid,attendance_percent numeric);
      CREATE TABLE student_profiles(user_id uuid,enrollment_no text,enrollment_number text,admission_number text);
      CREATE TABLE staff_gate_passes(pass_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid,staff_user_id uuid,out_time timestamp,expected_in_time timestamp,status text,deleted_at timestamptz);
      CREATE TABLE hr_employee_appraisals(id uuid DEFAULT gen_random_uuid(),hr_final_status text);`);
    for(const file of ['20261031151000_attendance_reopening.sql','20261031152000_event_class_cohorts.sql','20261031153000_request_raised_timestamps.sql'])await query(readFileSync(resolve(__dirname,'../../../migrations',file),'utf8'));
    await query('INSERT INTO tenants VALUES($1)',[tenant]);
    for(const id of [faculty,hod,coordinator,student,hr])await query('INSERT INTO users(user_id,tenant_id,dept_id,name) VALUES($1::uuid,$2,1,$1::uuid::text)',[id,tenant]);
    await query("INSERT INTO departments(dept_id,hod_user_id,school_id,dept_name) VALUES(1,$1,1,'Pharmacy')",[hod]);
    await query("INSERT INTO roles VALUES(1,'HR'),(2,'HRExecutive'),(3,'Security')");await query('UPDATE users SET role_id=1 WHERE user_id=$1',[hr]);
    await query('INSERT INTO schools VALUES(1,1)');
    await query('INSERT INTO academic_courses VALUES($1,$2,\'TEST\',\'Test course\')',[course,tenant]);
    date=(await query("SELECT timezone('Asia/Kolkata',now())::date::text AS date"))[0].date;
    await query("INSERT INTO academic_timetables VALUES($1,$2,$3,$4,extract(isodow FROM $5::date),'09:00','10:00','A','R1',null,null,null)",[slot,tenant,course,faculty,date]);
    await query('INSERT INTO campus_clubs VALUES($1,$2,$3)',[club,tenant,coordinator]);
    await query("INSERT INTO campus_events VALUES($1,$2,$3,'Approved event',($4::date+time '09:00') AT TIME ZONE 'Asia/Kolkata','LIVE','APPROVED','APPROVED','APPROVED','NOT_REQUIRED',null,0)",[event,tenant,club,date]);
    await query('INSERT INTO student_course_enrollments VALUES($1,$2,$3,null)',[tenant,course,student]);
    service=Object.create(AcademicsFacultyService.prototype);
    Object.assign(service,{dataSource:{query,transaction},getCourseStudents:jest.fn(async()=>[{student_id:student}])});
  });
  afterAll(async()=>{if(created)await query(`DROP SCHEMA ${schema} CASCADE`);await client?.end();});
  beforeEach(async()=>{
    await query('TRUNCATE academic_event_class_audit,course_attendance_logs,academic_event_class_cohorts,academic_attendance_correction_audit,academic_attendance_reopen_requests');
    await query("UPDATE campus_events SET status='LIVE',hod_approval='APPROVED';UPDATE users SET is_active=true;DELETE FROM hr_access_controls;DELETE FROM department_leadership");
    (service.getCourseStudents as jest.Mock).mockResolvedValue([{student_id:student}]);
  });
  const request=()=>service.requestEventClass(tenant,faculty,{event_id:event,course_id:course,timetable_id:slot,date,reason:'Students attending an approved event'},randomUUID());
  const approve=async()=>{const x=await request();return service.decideEventClass(tenant,hod,x.cohort_id,1,'APPROVE','Approved exact class cohort');};
  it('requires both event approval and independent HOD cohort approval',async()=>{
    const x=await request();expect(await eventExemptions(query,tenant,date)).toHaveLength(0);
    await expect(service.decideEventClass(tenant,faculty,x.cohort_id,1,'APPROVE','Self decision')).rejects.toThrow();
    await service.decideEventClass(tenant,hod,x.cohort_id,1,'APPROVE','Verified cohort');
    expect(await eventExemptions(query,tenant,date)).toHaveLength(1);
    await query("UPDATE campus_events SET hod_approval='PENDING'");
    expect(await eventExemptions(query,tenant,date)).toHaveLength(0);
    await expect(service.saveEventClassAttendance(tenant,coordinator,x.cohort_id,2,[{student_id:student,status:'PRESENT'}])).rejects.toThrow('Only the approved event coordinator');
  });
  it('rejects a changed student roster and stale decision revision',async()=>{
    const x=await request();(service.getCourseStudents as jest.Mock).mockResolvedValue([{student_id:randomUUID()}]);
    await expect(service.decideEventClass(tenant,hod,x.cohort_id,1,'APPROVE','Checked again')).rejects.toThrow('cohort changed');
    await expect(service.decideEventClass(tenant,hod,x.cohort_id,9,'REJECT','Wrong revision')).rejects.toThrow('Request changed');
  });
  it('prevents cross-tenant decisions and non-coordinator attendance',async()=>{
    const x=await approve();await expect(service.decideEventClass(randomUUID(),hod,x.cohort_id,2,'REJECT','Cross tenant')).rejects.toThrow('not found');
    await expect(service.saveEventClassAttendance(tenant,faculty,x.cohort_id,2,[{student_id:student,status:'PRESENT'}])).rejects.toThrow('Only the approved event coordinator');
    await expect(assertNoEventExemption(query,tenant,slot,date)).rejects.toThrow('event coordinator');
    await expect(assertNoEventExemption(query,tenant,undefined,date,course)).rejects.toThrow('event coordinator');
  });
  it('writes one actual event attendance sheet, updates percent and audits corrections',async()=>{
    const x=await approve();
    await expect(service.saveEventClassAttendance(tenant,coordinator,x.cohort_id,2,[])).rejects.toThrow('every student');
    await service.saveEventClassAttendance(tenant,coordinator,x.cohort_id,2,[{student_id:student,status:'PRESENT'}]);
    expect((await query('SELECT attendance_percent FROM student_course_enrollments'))[0].attendance_percent).toBe('100.00');
    await expect(service.saveEventClassAttendance(tenant,coordinator,x.cohort_id,2,[{student_id:student,status:'ABSENT'}])).rejects.toThrow('changed');
    await service.saveEventClassAttendance(tenant,coordinator,x.cohort_id,3,[{student_id:student,status:'ABSENT'}]);
    expect(await query('SELECT * FROM course_attendance_logs')).toHaveLength(1);
    expect((await query('SELECT attendance_percent FROM student_course_enrollments'))[0].attendance_percent).toBe('0.00');
    expect(await query("SELECT * FROM academic_event_class_audit WHERE action='ATTENDANCE'")).toHaveLength(2);
  });
  it('matches reopening permission to exact faculty, tenant, date and session and checks expiry',async()=>{
    await query(`INSERT INTO academic_attendance_reopen_requests(tenant_id,faculty_user_id,course_id,session_key,class_date,reason,status,expires_at,idempotency_key)
      VALUES($1,$2,$3,$4,$5,'Correction','APPROVED',now()+interval '1 hour','key')`,[tenant,faculty,course,slot,date]);
    expect(await attendanceReopening(query,tenant,faculty,course,slot,date)).not.toBeNull();
    expect(await attendanceReopening(query,tenant,hod,course,slot,date)).toBeNull();
    expect(await attendanceReopening(query,tenant,faculty,course,randomUUID(),date)).toBeNull();
    await query("UPDATE academic_attendance_reopen_requests SET expires_at=now()-interval '1 second'");
    expect(await attendanceReopening(query,tenant,faculty,course,slot,date)).toBeNull();
  });
  it('allows only an active scoped HOD to reopen, and rejects repeated decisions',async()=>{
    const [x]=await query(`INSERT INTO academic_attendance_reopen_requests(tenant_id,faculty_user_id,course_id,session_key,class_date,reason,idempotency_key)
      VALUES($1,$2,$3,$4,$5,'Correct a missed attendance entry','reopen') RETURNING request_id`,[tenant,faculty,course,slot,date]);
    expect(await attendanceReopening(query,tenant,faculty,course,slot,date)).toBeNull();
    await expect(service.decideAttendanceReopening(tenant,coordinator,x.request_id,'APPROVE','Verified request',1)).rejects.toThrow('outside');
    await query('UPDATE users SET is_active=false WHERE user_id=$1',[hod]);
    await expect(service.decideAttendanceReopening(tenant,hod,x.request_id,'APPROVE','Verified request',1)).rejects.toThrow('outside');
    await query('UPDATE users SET is_active=true WHERE user_id=$1',[hod]);
    const saved=await service.decideAttendanceReopening(tenant,hod,x.request_id,'APPROVE','Verified request',1);
    expect(saved.status).toBe('APPROVED');
    await expect(service.decideAttendanceReopening(tenant,hod,x.request_id,'REJECT','Second decision',1)).rejects.toThrow('changed');
    expect(await attendanceReopening(query,tenant,faculty,course,slot,date)).not.toBeNull();
  });
  it('replays a cohort request idempotently without duplicate audit or enrollment writes',async()=>{
    const key=randomUUID(),body={event_id:event,course_id:course,timetable_id:slot,date,reason:'Students attending an approved event'};
    const a=await service.requestEventClass(tenant,faculty,body,key),b=await service.requestEventClass(tenant,faculty,body,key);
    expect(a.cohort_id).toBe(b.cohort_id);expect(await query('SELECT * FROM academic_event_class_audit')).toHaveLength(1);
    expect(await query('SELECT * FROM student_course_enrollments')).toHaveLength(1);
  });
  it('shows only approved current-campus gate passes and denies non-security access',async()=>{
    const guard=randomUUID();await query('INSERT INTO users(user_id,tenant_id,dept_id,role_id) VALUES($1,$2,1,3)',[guard,tenant]);
    for(const status of ['PENDING','PENDING_HR','APPROVED','REJECTED'])await query(`INSERT INTO staff_gate_passes(tenant_id,staff_user_id,out_time,expected_in_time,status)
      VALUES($1,$2,timezone('Asia/Kolkata',now())-interval '1 hour',timezone('Asia/Kolkata',now())+interval '1 hour',$3)`,[tenant,faculty,status]);
    const controller=new GatePassVerificationController({query} as any);
    const passes=await controller.list({user:{user_id:guard,tenant_id:tenant}},'');
    expect(passes).toHaveLength(1);expect(passes[0].valid_now).toBe(true);
    await expect(controller.list({user:{user_id:faculty,tenant_id:tenant}},'')).rejects.toThrow('Security assignment');
    await query('UPDATE schools SET campus_id=2');await query('UPDATE users SET dept_id=null WHERE user_id=$1',[guard]);
    expect(await controller.list({user:{user_id:guard,tenant_id:tenant}},'')).toHaveLength(0);
    await query('UPDATE schools SET campus_id=1');
  });
  it('records new appraisal submission time but does not invent historical times',async()=>{
    const [draft]=await query("INSERT INTO hr_employee_appraisals(hr_final_status) VALUES('PENDING') RETURNING *");expect(draft.submitted_at).toBeNull();
    const [submitted]=await query("UPDATE hr_employee_appraisals SET hr_final_status='HOD_REVIEW' WHERE id=$1 RETURNING *",[draft.id]);expect(submitted.submitted_at).toBeInstanceOf(Date);
  });
  it('routes regularization to an independent HOD then scoped HR',async()=>{
    expect((await regularizationRoute(query,tenant,faculty)).approverIds).toEqual([hod,hr]);
    await expect(regularizationRoute(query,tenant,hod)).rejects.toThrow('independent department HOD');
    await query("INSERT INTO hr_access_controls VALUES($1,$2,'LEAVES',true,false,null,null)",[tenant,hr]);
    await expect(regularizationRoute(query,tenant,faculty)).rejects.toThrow('independent HR approver');
  });
  it('does not reuse a disabled HOD office or inactive HR assignment',async()=>{
    await query("INSERT INTO department_leadership VALUES($1,1,'PRINCIPAL_ONLY',1)",[tenant]);
    await expect(regularizationRoute(query,tenant,faculty)).rejects.toThrow('independent department HOD');
    await query('DELETE FROM department_leadership');await query('UPDATE users SET is_active=false WHERE user_id=$1',[hr]);
    await expect(regularizationRoute(query,tenant,faculty)).rejects.toThrow('independent HR approver');
  });
});
