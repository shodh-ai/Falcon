'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

const REQUIRED_DOCS = [
  '10th Marksheet',
  '12th Marksheet',
  'Aadhar Card',
  'PAN Card',
  'Admission Form',
  'Migration Certificate'
];

export default function AdmissionsEnrolledStudentsPage() {
  const api = useAuthedApi();
  const [students, setStudents] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [year, setYear] = useState('');
  const [branch, setBranch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [uploadingDocTitle, setUploadingDocTitle] = useState<string | null>(null);

  const loadStudents = () => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (year) params.set('year', year);
    if (branch) params.set('branch', branch);
    
    api.get<any[]>(`/api/admissions-crm/enrolled-students?${params.toString()}`).then(setStudents);
  };

  useEffect(() => {
    loadStudents();
  }, [api, q, year, branch]);

  function handleUploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingDocTitle || !selectedStudent) return;

    const formData = new FormData();
    formData.append('file', file);

    api.post<{ path: string }>('/api/uploads/single', formData)
      .then((res) => {
        return api.post(`/api/admissions-crm/enrolled-students/${selectedStudent.user_id}/documents`, {
          title: uploadingDocTitle,
          file_path: res.path,
        });
      })
      .then(() => {
        toast.success(`${uploadingDocTitle} uploaded successfully`);
        // update local selectedStudent immediately for the modal UI
        setSelectedStudent((prev: any) => ({
          ...prev,
          documents: [...(prev.documents || []), { title: uploadingDocTitle, file_path: 'pending_refresh' }]
        }));
        loadStudents();
      })
      .catch(() => toast.error(`Failed to upload ${uploadingDocTitle}`))
      .finally(() => {
        setUploadingDocTitle(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  }

  function getUploadedCount(docs: any[]) {
    if (!docs || docs.length === 0) return 0;
    // Count how many of REQUIRED_DOCS are present in docs
    return REQUIRED_DOCS.filter(reqDoc => docs.some(d => d.title === reqDoc)).length;
  }

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold">Enrolled Students Documents</h1>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="flex gap-4 mb-4">
              <input 
                type="text" 
                placeholder="Search name, email, ID..." 
                className="border rounded px-3 py-2 text-sm w-64"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <select 
                className="border rounded px-3 py-2 text-sm"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All Years</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
                <option value="2027">2027</option>
              </select>
              <select 
                className="border rounded px-3 py-2 text-sm"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
              >
                <option value="">All Branches</option>
                <option value="1">Computer Science</option>
                <option value="2">Mechanical Engineering</option>
                <option value="3">Civil Engineering</option>
                <option value="4">Electrical Engineering</option>
              </select>
            </div>

            <input 
              type="file" 
              accept="application/pdf,image/*" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleUploadDoc} 
            />

            <div className="rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="border-b text-left">
                    <th className="p-3 font-medium">Student Name</th>
                    <th className="p-3 font-medium">Email</th>
                    <th className="p-3 font-medium">Student ID</th>
                    <th className="p-3 font-medium">Branch / Year</th>
                    <th className="p-3 font-medium text-center">Documents Status</th>
                  </tr>
                </thead>
                <tbody>
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-center text-muted-foreground">No students found.</td>
                    </tr>
                  )}
                  {students.map((s) => {
                    const count = getUploadedCount(s.documents);
                    const total = REQUIRED_DOCS.length;
                    const isComplete = count === total;

                    return (
                      <tr 
                        key={s.user_id} 
                        className="border-b hover:bg-slate-50 cursor-pointer"
                        onClick={() => setSelectedStudent(s)}
                      >
                        <td className="p-3 text-sgvu-navy font-medium underline underline-offset-2">{s.name}</td>
                        <td className="p-3">{s.email}</td>
                        <td className="p-3">{s.enrollment_no ?? '—'}</td>
                        <td className="p-3">{s.dept_name ?? '—'} <br/><span className="text-xs text-muted-foreground">{s.batch ?? '—'}</span></td>
                        <td className="p-3 text-center font-bold">
                          <span className={isComplete ? "text-green-600" : "text-red-500"}>
                            {count}/{total}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Upload Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-[500px] shadow-lg max-h-[90vh] flex flex-col">
            <CardHeader className="border-b bg-muted/50 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>Admission Documents</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">{selectedStudent.name} ({selectedStudent.enrollment_no || 'Pending ID'})</p>
                </div>
                <button onClick={() => setSelectedStudent(null)} className="text-muted-foreground hover:text-black">
                  ✕
                </button>
              </div>
            </CardHeader>
            <CardContent className="overflow-y-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="border-b text-left">
                    <th className="p-4 font-medium">Document Type</th>
                    <th className="p-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {REQUIRED_DOCS.map(reqDoc => {
                    const existingDoc = selectedStudent.documents?.find((d: any) => d.title === reqDoc);
                    return (
                      <tr key={reqDoc} className="border-b">
                        <td className="p-4 font-medium">{reqDoc}</td>
                        <td className="p-4 text-right">
                          {existingDoc ? (
                            <a 
                              href={existingDoc.file_path.startsWith('http') || existingDoc.file_path === 'pending_refresh' ? existingDoc.file_path : `/api/uploads/download?path=${encodeURIComponent(existingDoc.file_path)}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-sgvu-navy underline hover:text-blue-800 font-medium"
                            >
                              View Doc
                            </a>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => {
                                setUploadingDocTitle(reqDoc);
                                fileInputRef.current?.click();
                              }}
                              disabled={uploadingDocTitle === reqDoc}
                            >
                              {uploadingDocTitle === reqDoc ? 'Uploading...' : 'Upload'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
