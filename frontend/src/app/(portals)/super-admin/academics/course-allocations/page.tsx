'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { API_URL } from '@/lib/api/client';
import { toast } from 'sonner';

type Allocation = {
  allocation_id: string;
  subject_code: string;
  subject_name: string;
  subject_type: string;
  credits: number;
  program_name: string;
  semester: string;
  academic_year: string;
  faculty_user_id: string | null;
  faculty_name: string | null;
  faculty_email: string | null;
};

type Faculty = {
  user_id: string;
  name: string;
  official_email: string;
};

export default function CourseAllocationsPage() {
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [facultyList, setFacultyList] = useState<Faculty[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFacultyId, setEditFacultyId] = useState<string>('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/api/super-admin/academics/course-allocations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllocations(data.items || []);
        setFacultyList(data.faculty || []);
      } else {
        toast.error('Failed to load allocations');
      }
    } catch (err) {
      toast.error('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (allocationId: string) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/api/super-admin/academics/course-allocations/${allocationId}/faculty`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ faculty_user_id: editFacultyId || null })
      });
      if (res.ok) {
        toast.success('Allocation updated successfully');
        setEditingId(null);
        fetchData();
      } else {
        toast.error('Failed to update allocation');
      }
    } catch (err) {
      toast.error('Network error');
    }
  };

  const handleDelete = async (allocationId: string) => {
    if (!confirm('Are you sure you want to delete this allocation?')) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_URL}/api/super-admin/academics/course-allocations/${allocationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (res.ok) {
        toast.success('Allocation deleted successfully');
        fetchData();
      } else {
        toast.error('Failed to delete allocation');
      }
    } catch (err) {
      toast.error('Network error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Course Allocations</h1>
          <p className="text-sm text-slate-500 mt-1">
            View, re-assign, and manage current course mappings
          </p>
        </div>
        <Button onClick={fetchData} variant="outline">Refresh</Button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading allocations...</div>
        ) : allocations.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No active course allocations found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-slate-900 font-medium border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Program / Sem</th>
                  <th className="px-4 py-3">Academic Year</th>
                  <th className="px-4 py-3">Faculty</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {allocations.map((a) => (
                  <tr key={a.allocation_id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{a.subject_name}</div>
                      <div className="text-xs text-slate-500">{a.subject_code} • {a.credits} cr • {a.subject_type}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div>{a.program_name || '-'}</div>
                      <div className="text-xs text-slate-500">{a.semester || '-'}</div>
                    </td>
                    <td className="px-4 py-3">{a.academic_year}</td>
                    <td className="px-4 py-3">
                      {editingId === a.allocation_id ? (
                        <select
                          className="w-full max-w-[200px] border border-slate-300 rounded p-1"
                          value={editFacultyId}
                          onChange={(e) => setEditFacultyId(e.target.value)}
                        >
                          <option value="">-- Unassigned --</option>
                          {facultyList.map(f => (
                            <option key={f.user_id} value={f.user_id}>
                              {f.name} ({f.official_email})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          {a.faculty_name ? (
                            <div className="font-medium text-slate-900">{a.faculty_name}</div>
                          ) : (
                            <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                              Unassigned
                            </span>
                          )}
                          {a.faculty_email && <div className="text-xs text-slate-500">{a.faculty_email}</div>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editingId === a.allocation_id ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => handleUpdate(a.allocation_id)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setEditingId(a.allocation_id);
                              setEditFacultyId(a.faculty_user_id || '');
                            }}
                          >
                            Re-assign
                          </Button>
                          <Button 
                            size="sm" 
                            variant="destructive"
                            onClick={() => handleDelete(a.allocation_id)}
                          >
                            Delete
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
