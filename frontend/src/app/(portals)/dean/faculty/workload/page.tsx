'use client';

import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';
import { Users, BookOpen, Clock, Building2, ChevronDown } from 'lucide-react';

interface WorkloadRecord {
  user_id: string;
  name: string;
  email: string;
  dept_id: number;
  dept_name: string;
  hod_name: string;
  hod_email: string;
  hours_per_week: number;
  course_count: number;
  workload_status: 'OVERLOADED' | 'UNDERUTILIZED' | 'BALANCED';
}

interface GroupedDepartment {
  dept_id: number;
  dept_name: string;
  hod_name: string;
  hod_email: string;
  faculties: WorkloadRecord[];
}

export default function DeanFacultyWorkloadPage() {
  const [departments, setDepartments] = useState<GroupedDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDeptIds, setExpandedDeptIds] = useState<number[]>([]);
  const api = useAuthedApi();

  const toggleDept = (id: number) => {
    setExpandedDeptIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  useEffect(() => {
    api.get<WorkloadRecord[]>('/api/academics/dean/faculty-workload')
      .then((data) => {
        const grouped = data.reduce((acc, curr) => {
          if (!acc[curr.dept_id]) {
            acc[curr.dept_id] = {
              dept_id: curr.dept_id,
              dept_name: curr.dept_name || 'Unknown Department',
              hod_name: curr.hod_name || 'No HOD Assigned',
              hod_email: curr.hod_email || '',
              faculties: [],
            };
          }
          acc[curr.dept_id].faculties.push(curr);
          return acc;
        }, {} as Record<number, GroupedDepartment>);

        setDepartments(Object.values(grouped).sort((a, b) => a.dept_name.localeCompare(b.dept_name)));
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load workload data');
      })
      .finally(() => setLoading(false));
  }, []);

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase();

  const getBadgeStyles = (status: string) => {
    switch (status) {
      case 'OVERLOADED': return 'bg-red-500/10 text-red-600 border-red-200';
      case 'UNDERUTILIZED': return 'bg-amber-500/10 text-amber-600 border-amber-200';
      case 'BALANCED': return 'bg-emerald-500/10 text-emerald-600 border-emerald-200';
      default: return '';
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center items-center h-[50vh] text-slate-500">Loading hierarchical data...</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Faculty Workload Hierarchy</h1>
        <p className="text-slate-500 mt-2 text-lg">Comprehensive view of workload distribution across all branches under your administration.</p>
      </div>

      <div className="space-y-6">
        {departments.map((dept) => (
          <Card key={dept.dept_id} className="overflow-hidden border-slate-200 shadow-sm transition-all hover:shadow-md">
            {/* Department Header */}
            <div 
              className="bg-gradient-to-r from-slate-50 to-white border-b border-slate-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-100/50 transition-colors"
              onClick={() => toggleDept(dept.dept_id)}
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0">
                  <Building2 className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{dept.dept_name}</h2>
                  <p className="text-sm text-slate-500">{dept.faculties.length} Faculties</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* HOD Info */}
                <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm">
                  <Avatar className="h-8 w-8 border border-slate-100">
                    <AvatarFallback className="bg-slate-100 text-slate-600 text-xs font-semibold">{getInitials(dept.hod_name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800 flex items-center gap-1">
                      {dept.hod_name} <Badge variant="outline" className="text-[10px] h-4 px-1 py-0 ml-1">HOD</Badge>
                    </span>
                    <span className="text-xs text-slate-500 truncate max-w-[150px]" title={dept.hod_email}>{dept.hod_email}</span>
                  </div>
                </div>
                
                <div className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
                  <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${expandedDeptIds.includes(dept.dept_id) ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </div>

            {/* Faculties List */}
            {expandedDeptIds.includes(dept.dept_id) && (
              <CardContent className="p-0 animate-in slide-in-from-top-2 fade-in duration-200">
              <div className="divide-y divide-slate-100">
                {dept.faculties.map((faculty) => (
                  <div key={faculty.user_id} className="p-4 sm:px-6 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 border border-slate-100">
                        <AvatarFallback className="bg-indigo-50 text-indigo-600 font-medium">{getInitials(faculty.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-slate-900">{faculty.name}</p>
                        <p className="text-sm text-slate-500">{faculty.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:gap-8">
                      <div className="flex flex-col items-center sm:items-end">
                        <div className="flex items-center gap-1.5 text-slate-600">
                          <BookOpen className="h-4 w-4 opacity-70" />
                          <span className="text-sm font-medium">{faculty.course_count} Courses</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-600 mt-0.5">
                          <Clock className="h-4 w-4 opacity-70" />
                          <span className="text-sm font-medium">{faculty.hours_per_week} hrs/wk</span>
                        </div>
                      </div>

                      <div className="w-[110px] flex justify-end">
                        <Badge variant="outline" className={`font-semibold border ${getBadgeStyles(faculty.workload_status)}`}>
                          {faculty.workload_status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
                
                {dept.faculties.length === 0 && (
                  <div className="p-8 text-center text-slate-500 text-sm">
                    No faculty workloads found for this department.
                  </div>
                )}
              </div>
              </CardContent>
            )}
          </Card>
        ))}

        {departments.length === 0 && (
          <div className="text-center py-24 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-slate-900">No Data Available</h3>
            <p className="text-slate-500">There are no departments or faculties assigned under your administration.</p>
          </div>
        )}
      </div>
    </div>
  );
}
