import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {EventAttendancePanel} from '@/components/faculty/EventAttendancePanel';
const {api,user}=vi.hoisted(()=>({api:{get:vi.fn(),post:vi.fn()},user:{user_id:'coordinator'}}));
vi.mock('@/lib/api',()=>({useAuthedApi:()=>api}));
vi.mock('@/context/AuthContext',()=>({useAuth:()=>({user})}));
vi.mock('@/lib/notifications/falcon-toast',()=>({toast:{success:vi.fn()}}));
const row={cohort_id:'cohort',event_title:'Approved science event',course_code:'BP101',class_date:'2026-10-31',faculty_name:'Teacher',coordinator_name:'Coordinator',coordinator_user_id:'coordinator',status:'APPROVED',revision:2,created_at:'2026-10-30T10:00:00Z',event_approved:true,reason:'Attend approved event',student_ids:['student']};
describe('event attendance',()=>{
  beforeEach(()=>{api.get.mockReset();api.post.mockReset();api.post.mockResolvedValue({});});
  const data=(overrides={})=>api.get.mockImplementation((path:string)=>Promise.resolve(path.endsWith('/events')?[]:path.endsWith('/roster')?[{student_id:'student',name:'Student A',roll_number:'123'}]:[{...row,...overrides}]));
  it('requires explicit attendance for every student and sends the approved revision',async()=>{
    data();render(<EventAttendancePanel/>);fireEvent.click(await screen.findByRole('button',{name:'Mark event attendance'}));
    const save=await screen.findByRole('button',{name:'Save event attendance'});expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Attendance for Student A'),{target:{value:'ABSENT'}});expect(save).toBeEnabled();fireEvent.click(save);
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/api/academics/faculty/event-classes/cohort/attendance',{attendance_data:[{student_id:'student',status:'ABSENT'}]},{'If-Match':'2'}));
  });
  it('does not offer attendance for a revoked event or an unapproved cohort',async()=>{
    data({event_approved:false});render(<EventAttendancePanel/>);await screen.findByText(/approval no longer active/);
    expect(screen.queryByRole('button',{name:'Mark event attendance'})).not.toBeInTheDocument();
  });
  it('shows the raised time and requires a reason before the HOD can decide',async()=>{
    data({status:'PENDING'});render(<EventAttendancePanel hod/>);await screen.findByText(/Raised on/);
    expect(screen.getByRole('button',{name:'Approve cohort'})).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Decision reason BP101'),{target:{value:'Cohort checked'}});
    fireEvent.click(screen.getByRole('button',{name:'Approve cohort'}));
    await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/api/academics/hod/event-classes/cohort/decision',{action:'APPROVE',reason:'Cohort checked'},{'If-Match':'2'}));
  });
});
