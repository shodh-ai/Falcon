'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { FacultyPageHeader, FacultyPageShell, FacultyEmptyState } from '@/components/faculty';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { useAuthedApi } from '@/lib/api';
import { ChevronDown, ChevronUp, Calendar, DollarSign, Users, Plus, CheckCircle, Search, Clock, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const formatDate = (isoString: string) => 
  new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

type Student = {
  student_user_id: string;
  name: string;
  official_email: string;
  department: string | null;
  grade: string | null;
};

type FundingRequest = {
  request_id: string;
  amount: number;
  purpose: string;
  status: 'PENDING_HOD' | 'APPROVED_HOD' | 'REJECTED_HOD' | 'TRANSFERRED';
  created_at: string;
  hod_commit_message?: string;
};

type Guide = {
  guide_id: string;
  project_title: string;
  program: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  funding_allocated: number | null;
  funding_consumed: number | null;
  students: Student[];
  funding_requests: FundingRequest[];
};

type DirectoryUser = {
  user_id: string;
  name: string;
  official_email: string;
  department_name: string;
  batch: string;
};

export default function FacultyProjectsPage() {
  const api = useAuthedApi();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  
  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [studentModalOpen, setStudentModalOpen] = useState<string | null>(null);
  const [fundingModalOpen, setFundingModalOpen] = useState<string | null>(null);

  // Directory Search State
  const [directory, setDirectory] = useState<DirectoryUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterBatch, setFilterBatch] = useState('ALL');

  // Form states
  const [newProject, setNewProject] = useState({ title: '', program: 'B.Tech CSE', amount: '' });
  const [selectedStudents, setSelectedStudents] = useState<{ id: string; name: string; grade?: string }[]>([]);
  const [newFunding, setNewFunding] = useState({ amount: '', purpose: '' });

  const fetchGuides = () => {
    setLoading(true);
    api.get<Guide[]>('/api/academics/faculty/workspaces/projects')
      .then(res => setGuides(res || []))
      .catch(err => toast.error(err.message))
      .finally(() => setLoading(false));
  };

  const fetchDirectory = () => {
    api.get<any>('/api/search/directory?role=Student&limit=1000')
      .then(res => setDirectory(res?.items || []))
      .catch(console.error);
  };

  useEffect(() => {
    fetchGuides();
    fetchDirectory();
  }, [api]);

  const handleCreateProject = async () => {
    if (!newProject.title) return toast.error('Title is required');
    try {
      await api.post('/api/academics/faculty/workspaces/projects/assign', {
        project_title: newProject.title,
        program: newProject.program,
        start_date: new Date().toISOString(),
        student_ids: selectedStudents.map(s => s.id)
      });
      toast.success('Project created successfully');
      setCreateModalOpen(false);
      setNewProject({ title: '', program: 'B.Tech CSE', amount: '' });
      setSelectedStudents([]);
      fetchGuides();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleUpdateStudents = async (guideId: string) => {
    try {
      await api.patch(`/api/academics/faculty/workspaces/projects/${guideId}/students`, {
        students: selectedStudents.map(s => ({ student_user_id: s.id, grade: s.grade || undefined }))
      });
      toast.success('Students and grades updated successfully');
      setStudentModalOpen(null);
      setSelectedStudents([]);
      fetchGuides();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRequestFunding = async (guideId: string) => {
    if (!newFunding.amount || !newFunding.purpose) return toast.error('All fields are required');
    try {
      await api.post(`/api/academics/faculty/workspaces/projects/${guideId}/funding`, {
        amount: Number(newFunding.amount),
        purpose: newFunding.purpose
      });
      toast.success('Funding requested successfully');
      setFundingModalOpen(null);
      setNewFunding({ amount: '', purpose: '' });
      fetchGuides();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleMarkComplete = async (guideId: string) => {
    try {
      await api.patch(`/api/academics/faculty/workspaces/projects/${guideId}/complete`);
      toast.success('Project marked as completed');
      fetchGuides();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const ongoingProjects = guides.filter(g => g.status === 'ACTIVE');
  const completedProjects = guides.filter(g => g.status === 'COMPLETED');

  // Filter directory for dropdown
  const filteredDirectory = directory.filter(u => 
    (filterDept === 'ALL' || u.department_name === filterDept) &&
    (filterBatch === 'ALL' || u.batch === filterBatch) &&
    (u.name.toLowerCase().includes(searchQuery.toLowerCase()) || u.official_email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const activeModalTitle = studentModalOpen === 'new' ? 'Select Students for Project' : 'Update Project Students';
  const handleSaveSelection = () => {
    if (studentModalOpen === 'new') setCreateModalOpen(true);
    else if (studentModalOpen) handleUpdateStudents(studentModalOpen);
    if (studentModalOpen === 'new') setStudentModalOpen(null);
  };


  const renderFundingTimeline = (req: FundingRequest) => {
    const steps = [
      { id: 'PENDING_HOD', label: 'Requested', icon: Clock },
      { id: 'APPROVED_HOD', label: 'HOD Approved', icon: CheckCircle },
      { id: 'TRANSFERRED', label: 'Funds Transferred', icon: DollarSign },
    ];

    let currentStepIndex = 0;
    if (req.status === 'APPROVED_HOD') currentStepIndex = 1;
    if (req.status === 'TRANSFERRED') currentStepIndex = 2;
    const isRejected = req.status === 'REJECTED_HOD';

    return (
      <div className="mt-4 p-4 border rounded-xl bg-slate-50">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-sm font-semibold text-slate-800">Funding Tracker</h4>
          <Badge variant="outline" className="font-mono bg-white">₹{req.amount.toLocaleString()}</Badge>
        </div>
        
        {isRejected ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800 font-medium flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              Request Rejected by HOD
            </p>
            {req.hod_commit_message && (
              <p className="text-xs text-red-600 mt-1 pl-4">"{req.hod_commit_message}"</p>
            )}
          </div>
        ) : (
          <div className="relative flex justify-between items-start">
            {/* Background Line */}
            <div className="absolute top-4 left-6 right-6 h-1 bg-slate-200 -z-10" />
            {/* Progress Line */}
            <div 
              className="absolute top-4 left-6 h-1 bg-emerald-500 transition-all duration-500 ease-in-out -z-10"
              style={{ width: `${(currentStepIndex / (steps.length - 1)) * 100}%` }}
            />
            
            {steps.map((step, idx) => {
              const isCompleted = idx <= currentStepIndex;
              const Icon = step.icon;
              return (
                <div key={step.id} className="flex flex-col items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-white border-slate-300 text-slate-400'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-xs font-medium ${isCompleted ? 'text-slate-800' : 'text-slate-500'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <FacultyPageShell>
        <div className="p-8 text-center animate-pulse text-slate-500">Loading guides...</div>
      </FacultyPageShell>
    );
  }

  return (
    <FacultyPageShell>
      <div className="flex justify-between items-center mb-6">
        <FacultyPageHeader description="Final-year B.Tech/MBA project supervision — track progress, students, and funding." />
        <Button onClick={() => setCreateModalOpen(true)} className="bg-sgvu-navy hover:bg-sgvu-navy/90 text-white shadow-lg shadow-sgvu-navy/20">
          <Plus className="w-4 h-4 mr-2" />
          Create Project
        </Button>
      </div>

      {guides.length === 0 ? (
        <FacultyEmptyState description="No guided projects assigned currently." />
      ) : (
        <div className="space-y-10">
          {/* Ongoing Projects Section */}
          <section>
            <h2 className="text-lg font-bold text-sgvu-navy mb-4 flex items-center">
              <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" />
              Ongoing Projects ({ongoingProjects.length}/4)
            </h2>
            {ongoingProjects.length === 0 ? (
              <p className="text-sm text-slate-500 italic px-4">No active projects.</p>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {ongoingProjects.map((g) => (
                  <Card key={g.guide_id} className="border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 bg-white overflow-hidden group">
                    <CardHeader className="pb-3 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge variant="outline" className="mb-2 bg-indigo-50 text-indigo-700 border-indigo-200">{g.program}</Badge>
                          <CardTitle className="text-xl text-sgvu-navy font-bold leading-tight group-hover:text-indigo-700 transition-colors">{g.project_title}</CardTitle>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 shadow-sm px-3 py-1">Active</Badge>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="pt-5 space-y-4">
                      {/* Meta Info */}
                      <div className="flex flex-wrap gap-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-indigo-400" />
                          <span className="font-medium">{g.start_date ? formatDate(g.start_date) : 'N/A'}</span>
                        </div>
                        <div className="flex items-center">
                          <DollarSign className="w-4 h-4 mr-2 text-emerald-400" />
                          <span className="font-medium">
                            Funded: <span className="text-emerald-700">₹{g.funding_allocated || 0}</span>
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Users className="w-4 h-4 mr-2 text-amber-400" />
                          <span className="font-medium">{g.students.length} Student{g.students.length === 1 ? '' : 's'}</span>
                        </div>
                      </div>

                      {/* Funding Trackers */}
                      {g.funding_requests && g.funding_requests.length > 0 && (
                        <div>
                          {g.funding_requests.map(req => (
                            <div key={req.request_id}>{renderFundingTimeline(req)}</div>
                          ))}
                        </div>
                      )}

                      {/* Students Accordion */}
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <button 
                          onClick={() => setExpandedCard(expandedCard === g.guide_id ? null : g.guide_id)}
                          className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors focus:outline-none"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                              <Users className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-slate-800">Assigned Students</span>
                          </div>
                          {expandedCard === g.guide_id ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        
                        {expandedCard === g.guide_id && (
                          <div className="bg-slate-50 p-4 border-t border-slate-200">
                            {g.students.length === 0 ? (
                              <p className="text-sm text-slate-500 italic text-center py-2">No students assigned yet.</p>
                            ) : (
                              <div className="space-y-3">
                                {g.students.map((s, idx) => (
                                  <div key={idx} className="flex justify-between items-center p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                                    <div>
                                      <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                                      <p className="text-xs text-slate-500">{s.department} • {s.official_email}</p>
                                    </div>
                                    <Badge variant={s.grade ? "default" : "secondary"} className={s.grade ? "bg-sgvu-navy" : "bg-slate-100 text-slate-600"}>
                                      {s.grade ? `Grade: ${s.grade}` : 'No Grade'}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>

                    <CardFooter className="bg-slate-50 border-t border-slate-100 p-4 gap-2 flex-wrap">
                      <Button size="sm" variant="outline" className="text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={() => {
                        setSelectedStudents(g.students.map(s => ({ id: s.student_user_id, name: s.name, grade: s.grade ?? undefined })));
                        setStudentModalOpen(g.guide_id);
                      }}>
                        <Users className="w-4 h-4 mr-2" /> Edit Students & Grades
                      </Button>
                      <Button size="sm" variant="outline" className="text-amber-600 border-amber-200 hover:bg-amber-50" onClick={() => setFundingModalOpen(g.guide_id)}>
                        <DollarSign className="w-4 h-4 mr-2" /> Request Funding
                      </Button>
                      {g.status === 'ACTIVE' && (
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 ml-auto" onClick={() => handleMarkComplete(g.guide_id)}>
                          <CheckCircle className="w-4 h-4 mr-2" /> Mark Completed
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </section>

          {/* Completed Projects Section */}
          {completedProjects.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-slate-600 mb-4 flex items-center">
                <div className="w-2 h-2 rounded-full bg-slate-400 mr-2" />
                Completed Projects ({completedProjects.length})
              </h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 opacity-80 hover:opacity-100 transition-opacity">
                {completedProjects.map((g) => (
                  <Card key={g.guide_id} className="border-slate-200 bg-slate-50/50">
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <Badge variant="outline" className="mb-2 text-slate-500">{g.program}</Badge>
                          <CardTitle className="text-lg text-slate-700 font-bold">{g.project_title}</CardTitle>
                        </div>
                        <Badge variant="secondary" className="bg-slate-200 text-slate-600">Completed</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-4 text-xs text-slate-500 mb-4">
                        <div className="flex items-center"><Calendar className="w-3 h-3 mr-1" /> {g.start_date ? formatDate(g.start_date) : 'N/A'} - {g.end_date ? formatDate(g.end_date) : 'N/A'}</div>
                        <div className="flex items-center"><DollarSign className="w-3 h-3 mr-1" /> Funded: ₹{g.funding_allocated || 0}</div>
                      </div>
                      <div className="space-y-2 mt-4">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Students & Grades</p>
                        {g.students.map((s, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm bg-white p-2 border rounded shadow-sm">
                            <span className="font-medium text-slate-700">{s.name}</span>
                            <span className="text-emerald-600 font-bold">{s.grade || '-'}</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* Create Project Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Title</label>
              <Input value={newProject.title} onChange={e => setNewProject({...newProject, title: e.target.value})} placeholder="e.g. AI Based Surveillance System" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Program</label>
              <Select 
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={newProject.program} 
                onChange={e => setNewProject({...newProject, program: e.target.value})}
              >
                <option value="B.Tech CSE">B.Tech CSE</option>
                <option value="M.Tech">M.Tech</option>
                <option value="MBA">MBA</option>
                <option value="BCA">BCA</option>
              </Select>
            </div>
            <div className="pt-4 border-t">
              <Button variant="outline" className="w-full justify-between" onClick={() => {
                setCreateModalOpen(false);
                setTimeout(() => setStudentModalOpen('new'), 100);
              }}>
                <span>Selected Students: {selectedStudents.length}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
            <Button className="bg-sgvu-navy" onClick={handleCreateProject}>Create Project</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Funding Modal */}
      <Dialog open={!!fundingModalOpen} onOpenChange={(open) => !open && setFundingModalOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Project Funding</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount (₹)</label>
              <Input type="number" value={newFunding.amount} onChange={e => setNewFunding({...newFunding, amount: e.target.value})} placeholder="e.g. 5000" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Purpose of Funding</label>
              <textarea 
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={newFunding.purpose} 
                onChange={e => setNewFunding({...newFunding, purpose: e.target.value})} 
                placeholder="Hardware components, cloud credits, etc." 
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFundingModalOpen(null)}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={() => handleRequestFunding(fundingModalOpen!)}>Submit Request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Selection Modal (Integrated) */}
      <Dialog open={studentModalOpen !== null} onOpenChange={(open) => {
        if (!open) {
          if (studentModalOpen === 'new') setTimeout(() => setCreateModalOpen(true), 100);
          setStudentModalOpen(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{activeModalTitle}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search students by name or email..." 
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select 
                className="flex h-10 w-[140px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={filterBatch} 
                onChange={(e) => setFilterBatch(e.target.value)}
              >
                <option value="ALL">All Years</option>
                <option value="2022">2022</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
              </Select>
              <Select 
                className="flex h-10 w-[180px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={filterDept} 
                onChange={(e) => setFilterDept(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                <option value="Computer Science">Computer Science</option>
                <option value="Information Technology">Information Tech</option>
                <option value="Mechanical Engineering">Mechanical</option>
                <option value="Electrical Engineering">Electrical</option>
              </Select>
            </div>

            <div className="border rounded-md max-h-60 overflow-y-auto">
              {filteredDirectory.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">No students found</div>
              ) : (
                <div className="divide-y">
                  {filteredDirectory.map(u => {
                    const isSelected = selectedStudents.some(s => s.id === u.user_id);
                    return (
                      <div key={u.user_id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                        <div>
                          <p className="font-medium text-sm text-slate-800">{u.name}</p>
                          <p className="text-xs text-slate-500">{u.official_email} • {u.department_name || 'No Dept'} • {u.batch || 'Unknown Year'}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={isSelected ? "secondary" : "outline"}
                          onClick={() => {
                            if (isSelected) setSelectedStudents(prev => prev.filter(s => s.id !== u.user_id));
                            else setSelectedStudents(prev => [...prev, { id: u.user_id, name: u.name }]);
                          }}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {selectedStudents.length > 0 && (
              <div className="pt-2">
                <p className="text-sm font-medium mb-2">Selected ({selectedStudents.length}):</p>
                <div className="grid gap-2">
                  {selectedStudents.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 border border-slate-200 rounded-md bg-slate-50">
                      <span className="text-sm font-medium text-slate-700">{s.name}</span>
                      <div className="flex items-center gap-2">
                        {studentModalOpen !== 'new' && (
                          <Select
                            className="h-8 rounded-md border border-slate-300 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-sgvu-navy bg-white"
                            value={s.grade || ''}
                            onChange={(e) => setSelectedStudents(prev => prev.map(x => x.id === s.id ? { ...x, grade: e.target.value } : x))}
                          >
                            <option value="">No Grade</option>
                            <option value="A+">A+</option>
                            <option value="A">A</option>
                            <option value="B+">B+</option>
                            <option value="B">B</option>
                            <option value="C+">C+</option>
                            <option value="C">C</option>
                            <option value="F">F</option>
                          </Select>
                        )}
                        <button 
                          onClick={() => setSelectedStudents(prev => prev.filter(x => x.id !== s.id))}
                          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors focus:outline-none"
                        >×</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              if (studentModalOpen === 'new') setTimeout(() => setCreateModalOpen(true), 100);
              setStudentModalOpen(null);
            }}>Cancel</Button>
            <Button onClick={handleSaveSelection} className="bg-sgvu-navy hover:bg-sgvu-navy/90 text-white">Save Selection</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

  </FacultyPageShell>
  );
}
