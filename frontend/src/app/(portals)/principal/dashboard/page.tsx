'use client';
import {useEffect,useState} from 'react';
import {useAuthedApi} from '@/lib/api';
type Data={office:{login_alias:string};staff:{user_id:string;name:string;official_email:string}[];students:{user_id:string;name:string;student_login_id:string|null;enrollment_no:string|null}[];courses:{course_id:string;course_code:string;course_name:string}[]};
export default function PrincipalDashboard(){
 const api=useAuthedApi();const [data,setData]=useState<Data|null>(null);const [error,setError]=useState('');const [search,setSearch]=useState('');
 useEffect(()=>{let active=true;api.get<Data>('/api/academics/principal/overview').then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[api]);
 const query=search.toLowerCase();
 return <main className="mx-auto max-w-7xl space-y-6 p-6"><header><h1 className="text-2xl font-semibold">Principal - Department overview</h1><p className="text-muted-foreground">Department-scoped academic oversight. Reporting approvals retain independent HR and specialist final review.</p></header>
 {error?<p role="alert" className="text-red-700">{error}</p>:!data?<p>Loading authorized department data...</p>:<>
 <p>{data.office.login_alias} · {data.staff.length} staff · {data.students.length} students · {data.courses.length} courses</p>
 <label className="block">Search department data<input className="mt-2 block w-full rounded border p-3" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, SID, email or course code"/></label>
 <div className="grid gap-6 lg:grid-cols-3">{[
 {title:'Staff',rows:data.staff.map(x=>({id:x.user_id,label:x.name,detail:x.official_email}))},
 {title:'Students',rows:data.students.map(x=>({id:x.user_id,label:x.name,detail:x.student_login_id??x.enrollment_no??'SID not assigned'}))},
 {title:'Courses / subjects',rows:data.courses.map(x=>({id:x.course_id,label:x.course_code,detail:x.course_name}))}
 ].map(group=><section key={group.title} className="rounded-xl border bg-white p-4"><h2 className="mb-3 text-lg font-semibold">{group.title}</h2><ul className="max-h-[32rem] space-y-3 overflow-auto">{group.rows.filter(x=>`${x.label} ${x.detail}`.toLowerCase().includes(query)).map(x=><li className="border-b pb-2" key={x.id}><p>{x.label}</p><p className="break-words text-sm text-muted-foreground">{x.detail}</p></li>)}</ul></section>)}</div></>}
 </main>;
}
