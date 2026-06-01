'use client';

import { useAuth } from '@/context/AuthContext';
import { AlertCircle, Download, PlayCircle, Save, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const roles = [
  { id: 1, name: 'IQAC' },
  { id: 2, name: 'Dean' },
  { id: 3, name: 'Faculty' },
  { id: 4, name: 'HOD' },
  { id: 5, name: 'President' },
  { id: 6, name: 'HR' },
];

type AdminUser = {
  user_id: string;
  name: string;
  email: string;
  is_active: boolean;
  role_id?: number;
  dept_id?: number;
  role?: { role_name?: string };
  department?: { dept_name?: string };
};

type MasterTask = {
  task_id: number;
  task_name: string;
  month: string;
  role_id: number;
  task_description?: string;
  is_recurring?: boolean;
  role?: { role_name?: string };
};

export default function AdminPage() {
  const { user, token, isAuthenticated, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tasks, setTasks] = useState<MasterTask[]>([]);
  const [taskFilter, setTaskFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [schedulerMonth, setSchedulerMonth] = useState('May');
  const [activeTab, setActiveTab] = useState<'scheduler' | 'users' | 'tasks' | 'csv'>('scheduler');
  const [runningSchedulerAction, setRunningSchedulerAction] = useState<'distribute' | 'reminders' | 'report' | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [taskForm, setTaskForm] = useState({ task_name: '', role_id: '3', month: 'May', task_description: '' });
  const [userForm, setUserForm] = useState({ name: '', email: '', role_id: '3', dept_id: '' });

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.push('/');
      return;
    }

    const verifyAccess = async () => {
      const freshUser = await refreshUser();
      const role = freshUser?.role || user?.role;
      if (role !== 'IQAC' && role !== 'HR') {
        router.push('/dashboard');
      }
    };

    verifyAccess();
  }, [isAuthenticated, isLoading, refreshUser, router, user?.role]);

  useEffect(() => {
    if (token) loadAdminData();
  }, [token]);

  const headers = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : undefined;

  const loadAdminData = async () => {
    if (!token) return;
    const authHeaders = { Authorization: `Bearer ${token}` };
    const [usersResponse, tasksResponse] = await Promise.all([
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, { headers: authHeaders }),
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks`, { headers: authHeaders }),
    ]);
    if (usersResponse.ok) setUsers(await usersResponse.json());
    if (tasksResponse.ok) setTasks(await tasksResponse.json());
  };

  const showMessage = (type: 'success' | 'error', text: string) => setMessage({ type, text });

  const handleCreateUser = async () => {
    if (!headers || !userForm.name.trim() || !userForm.email.trim()) {
      showMessage('error', 'Please enter user name and email.');
      return;
    }
    setSavingUser(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: userForm.name,
          email: userForm.email,
          role_id: Number(userForm.role_id),
          dept_id: userForm.dept_id ? Number(userForm.dept_id) : undefined,
          is_active: true,
        }),
      });
      if (!response.ok) throw new Error();
      showMessage('success', 'User created successfully.');
      setUserForm({ name: '', email: '', role_id: '3', dept_id: '' });
      await loadAdminData();
    } catch {
      showMessage('error', 'Failed to create user.');
    } finally {
      setSavingUser(false);
    }
  };

  const updateUserRole = async (userId: string, roleId: number) => {
    if (!headers) return;
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${userId}/role/${roleId}`, { method: 'PUT', headers });
    showMessage(response.ok ? 'success' : 'error', response.ok ? 'User role updated.' : 'Failed to update user role.');
    await loadAdminData();
  };

  const toggleUserActive = async (targetUser: AdminUser) => {
    if (!headers) return;
    const endpoint = targetUser.is_active ? 'deactivate' : 'activate';
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${targetUser.user_id}/${endpoint}`, { method: 'PUT', headers });
    showMessage(response.ok ? 'success' : 'error', response.ok ? 'User status updated.' : 'Failed to update user status.');
    await loadAdminData();
  };

  const saveTask = async () => {
    if (!headers || !taskForm.task_name.trim()) {
      showMessage('error', 'Please enter a task name.');
      return;
    }
    setSavingTask(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks${editingTaskId ? `/${editingTaskId}` : ''}`, {
        method: editingTaskId ? 'PUT' : 'POST',
        headers,
        body: JSON.stringify({
          task_name: taskForm.task_name,
          role_id: Number(taskForm.role_id),
          month: taskForm.month,
          task_description: taskForm.task_description || undefined,
          is_recurring: true,
        }),
      });
      if (!response.ok) throw new Error();
      showMessage('success', editingTaskId ? 'Master task updated.' : 'Master task added successfully.');
      setEditingTaskId(null);
      setTaskForm({ task_name: '', role_id: '3', month: 'May', task_description: '' });
      await loadAdminData();
    } catch {
      showMessage('error', 'Failed to save master task.');
    } finally {
      setSavingTask(false);
    }
  };

  const editTask = (task: MasterTask) => {
    setEditingTaskId(task.task_id);
    setTaskForm({
      task_name: task.task_name,
      role_id: String(task.role_id),
      month: task.month,
      task_description: task.task_description || '',
    });
  };

  const deleteTask = async (taskId: number) => {
    if (!headers || !window.confirm('Delete this master task?')) return;
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks/${taskId}`, { method: 'DELETE', headers });
    showMessage(response.ok ? 'success' : 'error', response.ok ? 'Master task deleted.' : 'Failed to delete master task.');
    await loadAdminData();
  };

  const runScheduler = async (action: 'distribute' | 'reminders' | 'report') => {
    if (!headers) return;
    setRunningSchedulerAction(action);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/scheduler/${action}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ month: schedulerMonth }),
      });
      const result = await response.json().catch(() => null);
      const detail = result?.sent !== undefined ? ` Sent ${result.sent} reminders.` : Array.isArray(result) ? ` Created ${result.length} assignments.` : '';
      showMessage(response.ok ? 'success' : 'error', response.ok ? `${action} triggered for ${schedulerMonth}.${detail}` : result?.message || `Failed to trigger ${action}.`);
      await loadAdminData();
    } finally {
      setRunningSchedulerAction(null);
    }
  };

  const handleUpload = async () => {
    if (!file || !token) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/tasks/upload-csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      showMessage(response.ok ? 'success' : 'error', response.ok ? 'CSV uploaded successfully.' : 'Failed to upload CSV.');
      if (response.ok) {
        setFile(null);
        await loadAdminData();
      }
    } catch {
      showMessage('error', 'An error occurred during upload.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const template = `Designation,January,February,March,April,May,June,July,August,September,October,November,December\nDean,"Activity Reports with geotagged photographs","Activity Reports with geotagged photographs","Activity Reports with geotagged photographs","Preparation of Curriculum Feedback Analysis","DAPC Meetings","DAPC Meetings","Activity Reports with geotagged photographs","Activity Reports with geotagged photographs","Activity Reports with geotagged photographs","Activity Reports with geotagged photographs","Activity Reports with geotagged photographs","Timetable Preparation for coming semester"\nFaculty,"PPT Uploading (Rest all units)","Conduction of VAC course","Conduction of VAC course","Preparation/Revision of PO, PSO and CO","Students undertaking field projects","PPT uploading (atleast 2 Units)","PPT Uploading (Rest all units)","Preparation of PT file","Conduction of VAC course","Conduction of VAC course","Conduction of Remedial Classes","PPT uploading (atleast 2 Units)"\nHOD,"Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements","Maintenance of Stocks/ Stock Register/ Lab Requirements"`;
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'task_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const visibleUsers = users.filter((adminUser) => `${adminUser.name} ${adminUser.email} ${adminUser.role?.role_name || ''} ${adminUser.department?.dept_name || ''}`.toLowerCase().includes(userFilter.toLowerCase()));
  const visibleTasks = tasks.filter((task) => `${task.task_name} ${task.month} ${task.role?.role_name || ''}`.toLowerCase().includes(taskFilter.toLowerCase()));

  if (isLoading || !user) return null;

  const tabs = [
    { id: 'scheduler', label: 'Scheduler' },
    { id: 'users', label: 'Users' },
    { id: 'tasks', label: 'Master Tasks' },
    { id: 'csv', label: 'CSV Upload' },
  ] as const;

  return (
    <div className="min-h-screen bg-[#f5f7fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#d6b65d]">Falcon Admin</p>
            <h1 className="mt-1 text-2xl font-black text-[#08234a]">Falcon OS · SGVU</h1>
            <p className="text-sm text-slate-500">{user.name} • {user.role}</p>
          </div>
          <button onClick={() => router.push('/dashboard')} className="rounded-xl bg-[#08234a] px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-[#0d356f]">Back to Dashboard</button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-6 py-8">
        {message && <div className={`rounded-2xl p-4 text-sm font-semibold ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{message.text}</div>}

        <div className="rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl px-4 py-3 text-sm font-bold transition ${activeTab === tab.id ? 'bg-[#08234a] text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'scheduler' && (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#d6b65d]">Automation</p>
              <h2 className="mt-2 text-3xl font-black text-[#08234a]">Scheduler Actions</h2>
              <p className="mt-2 text-sm text-slate-500">Manually run monthly task distribution, reminder emails, or defaulter reports for testing and admin operations.</p>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-600">Month</span>
                <select value={schedulerMonth} onChange={(event) => setSchedulerMonth(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-[#d6b65d]">
                  {months.map((month) => <option key={month} value={month}>{month}</option>)}
                </select>
              </label>
              <button disabled={!!runningSchedulerAction} onClick={() => runScheduler('distribute')} className="self-end rounded-xl bg-[#d6b65d] px-5 py-3 text-sm font-black text-[#08234a] shadow-sm hover:bg-[#c5a64f] disabled:opacity-60">{runningSchedulerAction === 'distribute' ? 'Running...' : 'Distribute Tasks'}</button>
              <button disabled={!!runningSchedulerAction} onClick={() => runScheduler('reminders')} className="self-end rounded-xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-60">{runningSchedulerAction === 'reminders' ? 'Sending...' : 'Send Reminders'}</button>
              <button disabled={!!runningSchedulerAction} onClick={() => runScheduler('report')} className="self-end rounded-xl bg-red-600 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-red-700 disabled:opacity-60">{runningSchedulerAction === 'report' ? 'Generating...' : 'Defaulter Report'}</button>
            </div>
          </section>
        )}

        {activeTab === 'users' && (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black text-[#08234a]">Create User</h2>
              <div className="mt-5 space-y-4">
                <input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} placeholder="Full name" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                <input value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} placeholder="Official email" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                <select value={userForm.role_id} onChange={(event) => setUserForm({ ...userForm, role_id: event.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm">
                  {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
                </select>
                <input value={userForm.dept_id} onChange={(event) => setUserForm({ ...userForm, dept_id: event.target.value })} placeholder="Department ID optional" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                <button onClick={handleCreateUser} disabled={savingUser} className="w-full rounded-xl bg-[#08234a] px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{savingUser ? 'Saving...' : 'Create User'}</button>
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div><h2 className="text-2xl font-black text-[#08234a]">Users</h2><p className="text-sm text-slate-500">Manage roles and active status.</p></div>
                <input value={userFilter} onChange={(event) => setUserFilter(event.target.value)} placeholder="Search users" className="rounded-xl border border-slate-200 px-4 py-3 text-sm md:w-80" />
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left font-bold text-slate-600">User</th><th className="px-5 py-3 text-left font-bold text-slate-600">Role</th><th className="px-5 py-3 text-left font-bold text-slate-600">Status</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleUsers.map((adminUser) => (
                      <tr key={adminUser.user_id} className="hover:bg-slate-50">
                        <td className="px-5 py-4"><p className="font-bold text-[#08234a]">{adminUser.name}</p><p className="text-xs text-slate-500">{adminUser.email}</p></td>
                        <td className="px-5 py-4"><select value={adminUser.role_id || ''} onChange={(event) => updateUserRole(adminUser.user_id, Number(event.target.value))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></td>
                        <td className="px-5 py-4"><button onClick={() => toggleUserActive(adminUser)} className={`rounded-full px-3 py-1 text-xs font-black ${adminUser.is_active ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{adminUser.is_active ? 'Deactivate' : 'Activate'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'tasks' && (
          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[420px_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-2xl font-black text-[#08234a]">{editingTaskId ? 'Edit Master Task' : 'Add Master Task'}</h2>
              <div className="mt-5 space-y-4">
                <input value={taskForm.task_name} onChange={(event) => setTaskForm({ ...taskForm, task_name: event.target.value })} placeholder="Task name" className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                <select value={taskForm.role_id} onChange={(event) => setTaskForm({ ...taskForm, role_id: event.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm">{roles.slice(1, 4).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
                <select value={taskForm.month} onChange={(event) => setTaskForm({ ...taskForm, month: event.target.value })} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm">{months.map((month) => <option key={month} value={month}>{month}</option>)}</select>
                <textarea value={taskForm.task_description} onChange={(event) => setTaskForm({ ...taskForm, task_description: event.target.value })} placeholder="Description optional" rows={4} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm" />
                <button onClick={saveTask} disabled={savingTask} className="w-full rounded-xl bg-[#08234a] px-5 py-3 text-sm font-black text-white disabled:bg-slate-300">{savingTask ? 'Saving...' : editingTaskId ? 'Update Task' : 'Add New Master Task'}</button>
                {editingTaskId && <button onClick={() => { setEditingTaskId(null); setTaskForm({ task_name: '', role_id: '3', month: 'May', task_description: '' }); }} className="w-full rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-700">Cancel Editing</button>}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div><h2 className="text-2xl font-black text-[#08234a]">Master Tasks</h2><p className="text-sm text-slate-500">Edit or delete tasks included in monthly rollouts.</p></div>
                <input value={taskFilter} onChange={(event) => setTaskFilter(event.target.value)} placeholder="Search master tasks" className="rounded-xl border border-slate-200 px-4 py-3 text-sm md:w-80" />
              </div>
              <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50"><tr><th className="px-5 py-3 text-left font-bold text-slate-600">Task</th><th className="px-5 py-3 text-left font-bold text-slate-600">Actions</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">{visibleTasks.map((task) => (<tr key={task.task_id} className="hover:bg-slate-50"><td className="px-5 py-4"><p className="font-bold text-[#08234a]">{task.task_name}</p><p className="text-xs text-slate-500">{task.role?.role_name} • {task.month}</p></td><td className="whitespace-nowrap px-5 py-4"><button onClick={() => editTask(task)} className="mr-2 rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">Edit</button><button onClick={() => deleteTask(task.task_id)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700">Delete</button></td></tr>))}</tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'csv' && (
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-3xl font-black text-[#08234a]">CSV Upload</h2>
            <div className="mt-4 rounded-2xl border-l-4 border-blue-400 bg-blue-50 p-4 text-sm text-blue-700"><AlertCircle className="mr-2 inline h-5 w-5" />Use CSV upload for bulk master task imports.</div>
            <div className="mt-6 flex flex-wrap gap-3"><button onClick={handleDownloadTemplate} className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-bold text-slate-700"><Download className="h-4 w-4" />Download CSV Template</button><label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-3 font-bold text-slate-700"><Upload className="h-4 w-4" />{file ? file.name : 'Choose CSV'}<input type="file" accept=".csv" onChange={(event) => setFile(event.target.files?.[0] || null)} className="hidden" /></label><button onClick={handleUpload} disabled={!file || uploading} className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:bg-slate-300"><Save className="h-4 w-4" />{uploading ? 'Uploading...' : 'Upload CSV'}</button></div>
          </section>
        )}
      </main>
    </div>
  );
}
