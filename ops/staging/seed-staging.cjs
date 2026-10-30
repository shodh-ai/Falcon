'use strict';
// Bounded stdin-only helper. Owns synthetic staging data, never production.
const {createRequire}=require('node:module');
const requireApp=createRequire('/app/package.json');
const {Client}=requireApp('pg');
const bcrypt=requireApp('bcrypt');
const {PDFDocument,StandardFonts}=requireApp('pdf-lib');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const TENANTS=['f5000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002'];
async function main(){
 const chunks=[];let size=0;
 for await(const b of process.stdin){size+=b.length;if(size>16384)throw Error('payload');chunks.push(b);}
 const input=JSON.parse(Buffer.concat(chunks));
 if(Object.keys(input).sort().join(',')!=='owner_password,postgres_password' ||
    ![input.owner_password,input.postgres_password].every(x=>typeof x==='string'&&x.length>=32))throw Error('payload');
 if(process.getuid()!==61001 || process.cwd()!=='/app')throw Error('helper_identity');
 const client=new Client({host:'falcon-staging-postgres',port:5432,database:'falcon_staging',
   user:'postgres',password:input.postgres_password,connectionTimeoutMillis:5000,
   statement_timeout:10000,application_name:'falcon-staging-synthetic-seed'});
 try{
  await client.connect();
  const identity=(await client.query("SELECT current_database() db,current_user role,host(inet_server_addr()) address,current_setting('server_version_num')::int version")).rows[0];
  if(identity.db!=='falcon_staging'||identity.role!=='postgres'||!/^172\.30\.242\.\d+$/.test(identity.address)||identity.version<180000||identity.version>=190000)throw Error('database_identity');
  await client.query('BEGIN');
  const count=(await client.query('SELECT (SELECT count(*) FROM users)::int users,(SELECT count(*) FROM tenants)::int tenants,(SELECT count(*) FROM roles)::int roles')).rows[0];
  if(count.users||count.tenants||count.roles)throw Error('synthetic_seed_requires_empty_staging');
  const roles={};
  for(const name of ['SuperAdmin','CampusAdmin','Dean','Principal','HOD','Faculty','Student']){
   roles[name]=(await client.query('INSERT INTO roles(role_name,description) VALUES($1,$2) RETURNING role_id',[name,'Synthetic staging role'])).rows[0].role_id;
  }
  const ownerHash=await bcrypt.hash(input.owner_password,12);
  const now=Date.now();const files=[];const users=[];
  for(const [ti,tenant] of TENANTS.entries()){
   const suffix=String(ti+1);const subdomain=ti===0?'staging':'staging-other';
   await client.query('INSERT INTO tenants(tenant_id,name,subdomain,pg_schema,settings) VALUES($1,$2,$3,$4,$5)',
      [tenant,'FALCON Synthetic Campus '+suffix,subdomain,'public',JSON.stringify({allowed_email_domains:['falcon-staging.invalid']})]);
   const campus=(await client.query('INSERT INTO campuses(campus_name,campus_code,address) VALUES($1,$2,$3) RETURNING campus_id',
      ['Synthetic Campus '+suffix,'STG'+suffix,'Synthetic address — no real campus'])).rows[0].campus_id;
   const school=(await client.query('INSERT INTO schools(school_name,school_code,campus_id) VALUES($1,$2,$3) RETURNING school_id',
      ['Synthetic School '+suffix,'STGS'+suffix,campus])).rows[0].school_id;
   const dept=(await client.query('INSERT INTO departments(dept_name,school_id) VALUES($1,$2) RETURNING dept_id',
      ['Synthetic Department '+suffix,school])).rows[0].dept_id;
   const program=(await client.query('INSERT INTO iam_programs(program_name,program_code,duration_years,school_id,dept_id) VALUES($1,$2,4,$3,$4) RETURNING program_id',
      ['Synthetic Programme '+suffix,'STGP'+suffix,school,dept])).rows[0].program_id;
   const people={};
   for(const [index,role] of ['SuperAdmin','CampusAdmin','Dean','Principal','HOD','Faculty','Student'].entries()){
    const active=ti===0&&role==='SuperAdmin';
    const email=active?'owner@falcon-staging.invalid':role.toLowerCase()+suffix+'@falcon-staging.invalid';
    const user=(await client.query(`INSERT INTO users(tenant_id,name,official_email,role_id,dept_id,is_active,password_hash,onboarding_status,account_status)
      VALUES($1,$2,$3,$4,$5,$6,$7,'COMPLETED','ACTIVE') RETURNING user_id`,
      [tenant,'Synthetic '+role+' '+suffix,email,roles[role],dept,active,active?ownerHash:null])).rows[0].user_id;
    await client.query('INSERT INTO user_roles(user_id,role_id,is_primary) VALUES($1,$2,true)',[user,roles[role]]);
    people[role]=user;users.push({tenant_id:tenant,user_id:user,role,active});
    if(role==='Student')await client.query(`INSERT INTO student_profiles(user_id,tenant_id,enrollment_no,student_login_id,current_semester,section_code)
      VALUES($1,$2,$3,$4,1,'A')`,[user,tenant,'STG-ENR-'+suffix,'STG-SID-'+suffix]);
   }
   await client.query('UPDATE departments SET hod_user_id=$1 WHERE dept_id=$2',[people.HOD,dept]);
   const course=(await client.query('INSERT INTO academic_courses(tenant_id,course_code,course_name,credits) VALUES($1,$2,$3,3) RETURNING course_id',
     [tenant,'STG'+suffix+'101','Synthetic Foundations '+suffix])).rows[0].course_id;
   const subject=(await client.query('INSERT INTO academic_subjects(subject_code,subject_name,program_id,semester,credits) VALUES($1,$2,$3,1,3) RETURNING subject_id',
     ['STG'+suffix+'101','Synthetic Foundations '+suffix,program])).rows[0].subject_id;
   await client.query(`INSERT INTO academic_course_allocations(tenant_id,subject_id,faculty_user_id,academic_year,course_id,program_name,semester)
     VALUES($1,$2,$3,'2026-27',$4,$5,'1')`,[tenant,subject,people.Faculty,course,'Synthetic Programme '+suffix]);
   await client.query('INSERT INTO student_course_enrollments(tenant_id,student_user_id,course_id,semester) VALUES($1,$2,$3,1)',[tenant,people.Student,course]);
   const root=path.join('/app/uploads',tenant,'course-materials');fs.mkdirSync(root,{recursive:true,mode:0o750});
   const paths={};
   for(const type of ['syllabus','notes','assignment','weekly-test']){
    const doc=await PDFDocument.create();const page=doc.addPage();const font=await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('FALCON STAGING - SYNTHETIC DATA',{x:40,y:790,size:16,font});
    page.drawText('Sample '+type+' for Synthetic Campus '+suffix,{x:40,y:750,size:12,font});
    const bytes=Buffer.from(await doc.save());const target=path.join(root,'synthetic-'+type+'.pdf');
    try{fs.writeFileSync(target,bytes,{flag:'wx',mode:0o640});}
    catch(e){if(e.code!=='EEXIST')throw e;throw Error('seed_files_exist_requires_review');}
    paths[type]=target;files.push({relative:path.relative('/app/uploads',target),sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
   }
   for(const type of ['syllabus','notes'])await client.query(`INSERT INTO course_materials(tenant_id,course_id,faculty_user_id,title,file_path,material_type)
     VALUES($1,$2,$3,$4,$5,$6)`,[tenant,course,people.Faculty,'Synthetic '+type,paths[type],type==='syllabus'?'SYLLABUS':'NOTES']);
   await client.query(`INSERT INTO academic_assignments(tenant_id,course_id,faculty_user_id,title,max_marks,due_date,reference_file_path)
     VALUES($1,$2,$3,'Synthetic assignment',10,$4,$5)`,[tenant,course,people.Faculty,new Date(now+7*86400000),paths.assignment]);
   await client.query(`INSERT INTO weekly_tests(tenant_id,course_id,test_type,question_paper_url,start_time,end_time,created_by,answer_key,question_count,max_marks,scoring_version)
     VALUES($1,$2,'WT1',$3,$4,$5,$6,$7,1,1,2)`,[tenant,course,paths['weekly-test'],new Date(now+86400000),new Date(now+90000000),people.Faculty,JSON.stringify(['A'])]);
  }
  await client.query('COMMIT');
  process.stdout.write(JSON.stringify({seeded:true,tenants:TENANTS,users,files,active_accounts:1,
    note:'Only owner is enabled; synthetic role fixtures have no password and cannot sign in.'}));
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw Error('SYNTHETIC_SEED_REFUSED');}
 finally{await client.end();}
}
if(require.main===module)main().catch(()=>{process.stderr.write('Staging synthetic seed refused; inspect private owner evidence.\n');process.exitCode=1;});
module.exports={TENANTS};
