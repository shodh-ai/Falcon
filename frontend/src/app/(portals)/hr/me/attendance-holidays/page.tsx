'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Trash2, Pencil, Users, Briefcase, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { attendanceCircleStyle, ATTENDANCE_LEGEND } from '@/lib/hr-attendance-status';

type Holiday = {
  holiday_id: string;
  title: string;
  date: string;
  type: 'MANDATORY' | 'RESTRICTED';
  description: string | null;
  applicable_to: 'ALL' | 'STUDENT' | 'STAFF';
};

export default function AttendanceHolidaysCalendarPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [attendanceDays, setAttendanceDays] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());

  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('HRAdmin') || user?.roles?.includes('SuperAdmin') || user?.role === 'HRAdmin' || user?.role === 'SuperAdmin';

  const [form, setForm] = useState<{
    id?: string;
    title: string;
    date: string;
    type: string;
    applicable_to: string;
    description: string;
  }>({
    title: '',
    date: '',
    type: 'MANDATORY',
    applicable_to: 'ALL',
    description: '',
  });

  const api = useHrApi();

  const getLocalYYYYMMDD = (isoString: string) => {
    const d = new Date(isoString);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  useEffect(() => {
    fetchHolidays();
  }, []);

  const fetchHolidays = async () => {
    try {
      setLoading(true);
      const data = await api.get('/api/hr/admin/holidays');
      setHolidays(data || []);
    } catch (err: any) {
      toast.error('Failed to load holidays');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title || !form.date) return toast.error('Title and Date are required');
    try {
      if (form.id) {
        await api.put(`/api/hr/admin/holidays/${form.id}`, form);
        toast.success('Holiday updated');
      } else {
        await api.post('/api/hr/admin/holidays', form);
        toast.success('Holiday created');
      }
      setForm({ title: '', date: '', type: 'MANDATORY', applicable_to: 'ALL', description: '' });
      fetchHolidays();
    } catch (err: any) {
      toast.error('Failed to save holiday');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this holiday?')) return;
    try {
      await api.del(`/api/hr/admin/holidays/${id}`);
      toast.success('Holiday deleted');
      fetchHolidays();
    } catch (err: any) {
      toast.error('Failed to delete holiday');
    }
  };

  const editHoliday = (h: Holiday) => {
    setForm({
      id: h.holiday_id,
      title: h.title,
      date: getLocalYYYYMMDD(h.date),
      type: h.type,
      applicable_to: h.applicable_to,
      description: h.description || '',
    });
  };

  // Calendar logic
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const fetchAttendance = async () => {
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const data = await api.get(`/api/hr/attendance/calendar?month=${monthStr}`);
      const map: Record<string, any> = {};
      data?.days?.forEach((d: any) => {
        map[d.date] = d;
      });
      setAttendanceDays(map);
    } catch (err: any) {
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, [currentDate]);

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const days = Array.from({ length: 42 }, (_, i) => {
    const dayNum = i - firstDayOfMonth + 1;
    if (dayNum < 1 || dayNum > daysInMonth) return null;
    return dayNum;
  });

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const getHolidaysForDate = (d: number) => {
    const strDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return holidays.filter((h) => getLocalYYYYMMDD(h.date) === strDate);
  };

  const handleDayClick = (dayNum: number | null) => {
    if (!dayNum) return;
    const strDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayHolidays = holidays.filter((h) => getLocalYYYYMMDD(h.date) === strDate);
    
    if (dayHolidays.length > 0) {
      editHoliday(dayHolidays[0]);
    } else if (isAdmin) {
      setForm({
        id: undefined,
        title: '',
        date: strDate,
        type: 'MANDATORY',
        applicable_to: 'ALL',
        description: '',
      });
    }
  };

  if (loading) return <div className="p-8 text-slate-500">Loading calendar...</div>;

  return (
    <>
      <HrPageHeader title="Attendance & Holidays Calendar" description="Personal calendar and holiday management." />

      <div className={cn("grid gap-6", isAdmin ? "lg:grid-cols-3" : "lg:grid-cols-1")}>
        
        {/* Left Col: Calendar & List */}
        <div className={cn("space-y-6", isAdmin ? "lg:col-span-2" : "lg:col-span-1")}>
          <Card className="border-none shadow-sm shadow-blue-900/5 ring-1 ring-slate-100">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8 rounded-full">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-xl font-bold w-48 text-center">{monthName}</CardTitle>
                <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8 rounded-full">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="secondary" onClick={() => setCurrentDate(new Date())} className="h-8 text-xs font-semibold">
                Today
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 text-[11px] font-medium text-muted-foreground mb-4">
                {ATTENDANCE_LEGEND.map((item) => (
                  <div key={item.status} className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full ring-1 ring-black/5" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-slate-100 rounded-lg overflow-hidden border border-slate-100">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="bg-slate-50 py-2 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
                    {d}
                  </div>
                ))}
                
                {days.map((d, i) => {
                  const strDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(d ?? 0).padStart(2, '0')}`;
                  const dayHolidays = d ? getHolidaysForDate(d) : [];
                  const attDay = d ? attendanceDays[strDate] : null;
                  const isToday = d === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                  const isSelected = form.date === strDate;
                  const circleStyle = attDay ? attendanceCircleStyle(attDay.calculated_status) : undefined;
                  
                  return (
                    <div 
                      key={i} 
                      onClick={() => handleDayClick(d)}
                      className={cn(
                        "min-h-[72px] bg-white p-1.5 transition-colors relative cursor-pointer group hover:bg-blue-50/50",
                        !d && "bg-slate-50/50 cursor-default",
                        isSelected && isAdmin && "ring-2 ring-inset ring-blue-500 bg-blue-50/30"
                      )}
                    >
                      {d && (
                        <>
                          <span 
                            className={cn(
                              "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold mb-1",
                              isToday && !attDay ? "bg-blue-600 text-white" : (!attDay ? "text-slate-700 group-hover:text-blue-600" : "")
                            )}
                            style={circleStyle}
                            title={attDay?.tooltip}
                          >
                            {d}
                          </span>
                          
                          <div className="space-y-1">
                            {dayHolidays.map(h => (
                              <div key={h.holiday_id} className={cn(
                                "text-[10px] px-1.5 py-1 rounded font-medium flex items-center justify-between gap-1",
                                h.type === 'MANDATORY' ? "bg-red-50 text-red-700 border border-red-100" : "bg-orange-50 text-orange-700 border border-orange-100"
                              )}>
                                <div className="truncate flex items-center gap-1">
                                  <span className="font-bold opacity-80">{h.type === 'RESTRICTED' ? 'RH' : 'M'}</span>
                                  <span className="truncate">{h.title}</span>
                                </div>
                                {h.applicable_to === 'STAFF' && <Briefcase className="h-3 w-3 shrink-0 opacity-70" title="Staff" />}
                                {h.applicable_to === 'STUDENT' && <Users className="h-3 w-3 shrink-0 opacity-70" title="Students" />}
                                {h.applicable_to === 'ALL' && <Globe className="h-3 w-3 shrink-0 opacity-70" title="All" />}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Form & Upcoming (Admins Only) */}
        {isAdmin && (
          <div className="space-y-6">
          <Card className="border-none shadow-sm shadow-blue-900/5 ring-1 ring-slate-100 overflow-hidden relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600" />
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-blue-600" />
                {form.id ? 'Edit Holiday' : 'Add Holiday'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none">Title</label>
                <Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="e.g. Independence Day" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Date</label>
                  <Input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium leading-none">Type</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                  >
                    <option value="MANDATORY">Mandatory</option>
                    <option value="RESTRICTED">Restricted (Optional)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none">Applicable To</label>
                <div className="grid grid-cols-3 gap-2">
                  <Button type="button" variant={form.applicable_to === 'ALL' ? 'default' : 'outline'} className="text-xs h-9" onClick={() => setForm({...form, applicable_to: 'ALL'})}>
                    <Globe className="h-3 w-3 mr-1.5" /> All
                  </Button>
                  <Button type="button" variant={form.applicable_to === 'STAFF' ? 'default' : 'outline'} className="text-xs h-9" onClick={() => setForm({...form, applicable_to: 'STAFF'})}>
                    <Briefcase className="h-3 w-3 mr-1.5" /> Staff
                  </Button>
                  <Button type="button" variant={form.applicable_to === 'STUDENT' ? 'default' : 'outline'} className="text-xs h-9" onClick={() => setForm({...form, applicable_to: 'STUDENT'})}>
                    <Users className="h-3 w-3 mr-1.5" /> Students
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium leading-none">Description (Optional)</label>
                <Input value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} placeholder="Any additional details..." />
              </div>

              <div className="pt-2 flex gap-3">
                <Button onClick={handleSave} className="w-full">
                  {form.id ? 'Save Changes' : 'Create Holiday'}
                </Button>
                {form.id && (
                  <Button variant="outline" onClick={() => setForm({ title: '', date: '', type: 'MANDATORY', applicable_to: 'ALL', description: '' })}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm shadow-blue-900/5 ring-1 ring-slate-100">
            <CardHeader className="py-4 bg-slate-50 border-b border-slate-100 rounded-t-xl">
              <CardTitle className="text-sm font-semibold text-slate-700">All Holidays (This Year)</CardTitle>
            </CardHeader>
            <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
              {holidays.filter(h => getLocalYYYYMMDD(h.date).startsWith(year.toString())).length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-6">No holidays configured.</div>
              ) : (
                holidays
                  .filter(h => getLocalYYYYMMDD(h.date).startsWith(year.toString()))
                  .map(h => (
                  <div key={h.holiday_id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-white hover:border-blue-200 transition-colors group">
                    <div>
                      <div className="font-medium text-sm text-slate-900 flex items-center gap-2">
                        {h.title}
                        {h.type === 'RESTRICTED' && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 rounded-full font-bold">RH</span>}
                      </div>
                      <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                        {new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        <span className="text-slate-300">•</span>
                        {h.applicable_to === 'ALL' ? 'All' : h.applicable_to === 'STAFF' ? 'Staff only' : 'Students only'}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-blue-600" onClick={() => {
                        setCurrentDate(new Date(h.date));
                        editHoliday(h);
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600" onClick={() => handleDelete(h.holiday_id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
        )}
      </div>
    </>
  );
}
