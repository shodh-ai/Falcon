'use client';

import { useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  HodPageFrame,
  HodPageHeader,
  HodPanel,
} from '@/components/hod/HodPagePrimitives';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  CheckCircle2, 
  AlertCircle, 
  FileSpreadsheet, 
  Send, 
  CheckSquare, 
  UploadCloud,
  FileCheck,
  Paperclip,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';

type CriteriaItem = {
  id: number;
  code: string;
  name: string;
  completion: number;
  status: 'PENDING' | 'READY' | 'SUBMITTED';
  owner: string;
};

const initialCriteria: CriteriaItem[] = [
  { id: 1, code: 'Criterion I', name: 'Curricular Aspects & CBCS Syllabus Alignments', completion: 100, status: 'READY', owner: 'Prof. Aditya Sharma' },
  { id: 2, code: 'Criterion II', name: 'Teaching-Learning and Evaluation Analytics', completion: 90, status: 'READY', owner: 'Dr. Dhruvi Patel' },
  { id: 3, code: 'Criterion III', name: 'Research Publications, Patents, and Extensions', completion: 80, status: 'READY', owner: 'Dr. Hitesh Mehta' },
  { id: 4, code: 'Criterion IV', name: 'Infrastructure, LMS Resources, and Lab Assets', completion: 100, status: 'READY', owner: 'Prof. S. R. Sen' },
  { id: 5, code: 'Criterion V', name: 'Student Support, Mentoring, and Progression Records', completion: 75, status: 'READY', owner: 'Dr. Neha Vyas' },
  { id: 6, code: 'Criterion VI', name: 'Governance, Leadership, and Committee Minutes', completion: 60, status: 'PENDING', owner: 'HOD Office' },
  { id: 7, code: 'Criterion VII', name: 'Best Departmental Practices & Academic Audits', completion: 85, status: 'READY', owner: 'Prof. Rajeev Joshi' }
];

export default function HodIqacPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [comment, setComment] = useState('');
  const [masterFile, setMasterFile] = useState<string | null>(null);
  const [expandedCriterionId, setExpandedCriterionId] = useState<number | null>(null);
  const [criterionFiles, setCriterionFiles] = useState<Record<number, string>>({});
  const [nudgedIds, setNudgedIds] = useState<Record<number, boolean>>({});
  const [criteria, setCriteria] = useState<CriteriaItem[]>(initialCriteria);

  const handleToggleCriterionUpload = (id: number) => {
    setExpandedCriterionId(prev => prev === id ? null : id);
  };

  const handleUploadCriterionFile = (id: number, code: string) => {
    const fakeNames: Record<string, string> = {
      'Criterion I': 'evidence_syllabus_cbc_alignment.pdf',
      'Criterion II': 'teaching_evaluation_matrix.pdf',
      'Criterion III': 'faculty_publications_patents.pdf',
      'Criterion IV': 'infra_lms_lab_assets.pdf',
      'Criterion V': 'student_mentoring_progression.pdf',
      'Criterion VI': 'governance_leadership_minutes.pdf',
      'Criterion VII': 'academic_audit_best_practices.pdf',
    };
    const fileName = fakeNames[code] || 'evidence_document.pdf';
    
    setCriterionFiles(prev => ({
      ...prev,
      [id]: fileName
    }));
    
    setCriteria(prev => prev.map(c => {
      if (c.id === id) {
        return {
          ...c,
          status: 'READY',
          completion: 100
        };
      }
      return c;
    }));

    toast.success(`Uploaded ${fileName} for ${code} successfully!`);
  };

  const handleRemoveCriterionFile = (id: number, code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setCriterionFiles(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });

    const original = initialCriteria.find(c => c.id === id);
    if (original) {
      setCriteria(prev => prev.map(c => {
        if (c.id === id) {
          return { ...original };
        }
        return c;
      }));
    }

    toast.info(`Removed supporting evidence for ${code}.`);
  };

  const handleNudgeCoordinator = (id: number, owner: string) => {
    setNudgedIds(prev => ({ ...prev, [id]: true }));
    toast.success(`Nudge alert notification email sent to coordinator (${owner}) successfully.`);
  };

  const totalCompleted = criteria.filter(c => c.status === 'READY' || c.status === 'SUBMITTED').length;
  const overallProgress = Math.round(
    criteria.reduce((acc, c) => acc + c.completion, 0) / criteria.length
  );

  const handleSubmit = async () => {
    setSubmitting(true);
    // Simulate API request
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setSubmitting(false);
    setSubmitted(true);
    
    // Update criteria status to SUBMITTED
    setCriteria(prev => prev.map(c => ({ ...c, status: 'SUBMITTED' })));
    toast.success('Department self-study reports submitted to the IQAC cell successfully!');
  };

  return (
    <HodPageFrame>
      <HodPageHeader
        title="IQAC Quality Assurance Portal"
        description="Compile, audit, and submit departmental self-study reports to the university IQAC cell for NAAC/NIRF compliance."
        meta={
          <div className="flex items-center gap-3">
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-bold border",
              submitted 
                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                : "bg-amber-50 text-amber-700 border-amber-200 animate-pulse"
            )}>
              {submitted ? 'Department Report Submitted' : 'Accreditation Cycle Active'}
            </span>
            <span>·</span>
            <span className="text-muted-foreground text-xs">{totalCompleted} of {criteria.length} Criteria Ready</span>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column: Criteria Progress Checklist */}
        <div className="lg:col-span-8 space-y-6">
          <HodPanel title="Accreditation Progress Summary" count={overallProgress}>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Self-Study Report (SSR) Progress</span>
                <span className="font-bold text-sgvu-navy">{overallProgress}% Complete</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100 border border-slate-200/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sgvu-navy to-sgvu-gold transition-all duration-500"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
            </div>
          </HodPanel>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-sgvu-navy flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-sgvu-gold" />
              NAAC Self-Study Report (SSR) Criteria Checklist
            </h3>
            
            <div className="space-y-3">
              {criteria.map((item) => (
                <div 
                  key={item.id} 
                  className={cn(
                    "flex flex-col p-4 rounded-xl border bg-white transition-all space-y-3",
                    item.status === 'PENDING' ? "border-amber-100 bg-amber-50/10" : "border-slate-100 hover:border-slate-200"
                  )}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-muted-foreground uppercase">{item.code}</span>
                        <span className={cn(
                          "rounded-md px-1.5 py-0.5 text-[10px] font-bold border",
                          item.status === 'SUBMITTED' ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                          item.status === 'READY' ? "bg-blue-50 text-blue-700 border-blue-100" : "bg-amber-50 text-amber-700 border-amber-100"
                        )}>
                          {item.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-sgvu-navy">{item.name}</h4>
                      <p className="text-xs text-muted-foreground">Criterion Coordinator: <span className="font-medium">{item.owner}</span></p>
                    </div>
                    
                    <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end">
                      <div className="text-right">
                        <p className="text-sm font-bold text-sgvu-navy">{item.completion}%</p>
                        <p className="text-[10px] text-muted-foreground">Completion</p>
                      </div>
                      <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/50 mr-2">
                        <div className={cn(
                          "h-full rounded-full",
                          item.completion === 100 ? "bg-emerald-500" : "bg-sgvu-gold"
                        )} style={{ width: `${item.completion}%` }} />
                      </div>
                      
                       {item.status === 'PENDING' && (
                         <Button
                           variant="ghost"
                           size="sm"
                           onClick={(e) => {
                             e.stopPropagation();
                             handleNudgeCoordinator(item.id, item.owner);
                           }}
                           disabled={nudgedIds[item.id]}
                           className={cn(
                             "text-xs font-bold gap-1.5 h-8 px-2.5 rounded-lg border shrink-0",
                             nudgedIds[item.id] 
                               ? "bg-slate-50 border-slate-200 text-slate-400" 
                               : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 hover:text-amber-800"
                           )}
                         >
                           <Send className="h-3.5 w-3.5" />
                           <span>{nudgedIds[item.id] ? "Nudged" : "Nudge"}</span>
                         </Button>
                       )}
                       
                       <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => handleToggleCriterionUpload(item.id)}
                         className="text-sgvu-navy hover:text-sgvu-gold hover:bg-slate-50 text-xs font-bold gap-1.5 h-8 px-2.5 rounded-lg border border-slate-100 shrink-0"
                       >
                         <Paperclip className="h-3.5 w-3.5 text-sgvu-navy" />
                         {criterionFiles[item.id] ? "View/Change" : "Upload Evidence"}
                       </Button>
                    </div>
                  </div>

                  {expandedCriterionId === item.id && (
                    <div className="border-t border-slate-100 pt-3">
                      <div 
                        onClick={() => handleUploadCriterionFile(item.id, item.code)}
                        className="border-2 border-dashed border-slate-200 hover:border-sgvu-navy/40 rounded-lg p-5 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer transition-all duration-200 bg-slate-50/10"
                      >
                        <UploadCloud className="h-5 w-5 text-slate-400 mb-1" />
                        {criterionFiles[item.id] ? (
                          <div className="text-center space-y-0.5 relative w-full">
                            <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 justify-center">
                              <CheckCircle2 className="h-3 w-3" /> Uploaded successfully
                            </p>
                            <p className="text-xs font-bold text-sgvu-navy truncate px-6">{criterionFiles[item.id]}</p>
                            <p className="text-[9px] text-muted-foreground">Click to upload another document</p>
                            <button
                              onClick={(e) => handleRemoveCriterionFile(item.id, item.code, e)}
                              className="absolute right-0 top-0 text-red-500 hover:text-red-700 transition p-1 hover:bg-red-50 rounded"
                              title="Remove file"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="text-xs font-bold text-sgvu-navy">Upload Supporting Evidence for {item.code}</p>
                            <p className="text-[9px] text-muted-foreground mt-0.5">PDF format up to 5MB (Click to select/simulate)</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Submission panel & exports */}
        <div className="lg:col-span-4 space-y-6">
          {/* Submit to IQAC Card */}
          <Card className="border-gray-100 shadow-sm bg-white overflow-hidden relative">
            <div className="absolute left-0 top-0 h-full w-1 bg-sgvu-gold" />
            <CardHeader className="bg-slate-50/50 pb-4 border-b border-gray-100">
              <CardTitle className="text-base font-bold text-sgvu-navy flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-sgvu-navy" />
                Submit Department Data
              </CardTitle>
              <CardDescription className="text-xs">
                Once submitted, files are locked and forwarded to the IQAC central repository.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 space-y-2">
                <h4 className="text-xs font-bold text-sgvu-navy uppercase">Audit Checklist</h4>
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>CBCS Syllabus Matrix Compiled</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Faculty Publications Verified</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <span>Student Placement Roster Attached</span>
                  </li>
                </ul>
              </div>

              {/* Master File Upload Zone */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">Upload Final Department SSR / Compiled Evidence (PDF/ZIP)</label>
                <div 
                  onClick={() => setMasterFile('CSE_Department_SSR_v2.zip')}
                  className="border-2 border-dashed border-slate-200 hover:border-sgvu-navy/40 rounded-xl p-4 flex flex-col items-center justify-center text-slate-500 hover:bg-slate-50 cursor-pointer transition-all duration-200 bg-slate-50/20"
                >
                  <UploadCloud className="h-6 w-6 text-slate-400 mb-1" />
                  {masterFile ? (
                    <div className="text-center space-y-0.5 relative w-full">
                      <p className="text-[10px] font-bold text-emerald-600 flex items-center gap-1 justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5" /> File Uploaded
                      </p>
                      <p className="text-xs font-bold text-sgvu-navy truncate px-6">{masterFile}</p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMasterFile(null);
                          toast.info('Master submission archive removed.');
                        }}
                        className="absolute right-0 top-0 text-red-500 hover:text-red-700 transition p-1 hover:bg-red-50 rounded"
                        title="Remove file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-xs font-semibold text-sgvu-navy">Drag & drop or Click to upload</p>
                      <p className="text-[9px] text-muted-foreground">PDF or ZIP up to 20MB</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase" htmlFor="submission-comments">HOD Audit Comments</label>
                <textarea
                  id="submission-comments"
                  className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:outline-none focus:ring-2 focus:ring-sgvu-gold bg-slate-50/20"
                  rows={4}
                  placeholder="Provide audit remarks or compiler comments..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  disabled={submitted}
                />
              </div>

              <Button
                className="w-full bg-sgvu-navy hover:bg-sgvu-navy/90 text-white rounded-xl h-11 text-sm font-semibold transition"
                onClick={handleSubmit}
                disabled={submitting || submitted || criteria.some(c => c.status === 'PENDING')}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Locking & Submitting...
                  </span>
                ) : submitted ? (
                  <span className="flex items-center justify-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-sgvu-gold" />
                    Submitted to IQAC Cell
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Send className="h-4 w-4 text-sgvu-gold" />
                    Submit Department Data
                  </span>
                )}
              </Button>

              {criteria.some(c => c.status === 'PENDING') && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-700 leading-normal">
                    You cannot submit the reports until all NAAC Criteria checklist metrics are marked as &quot;READY&quot;.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Exports Section */}
          <HodPanel title="Accreditation Exports">
            <div className="space-y-3">
              <button className="w-full flex items-center justify-between rounded-xl border border-slate-100 hover:border-slate-200 bg-white p-3 text-xs font-semibold text-sgvu-navy shadow-sm transition">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Faculty Research API Scores
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-muted-foreground">XLSX</span>
              </button>

              <button className="w-full flex items-center justify-between rounded-xl border border-slate-100 hover:border-slate-200 bg-white p-3 text-xs font-semibold text-sgvu-navy shadow-sm transition">
                <span className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                  Student Marks Compliance
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-muted-foreground">CSV</span>
              </button>

              <button className="w-full flex items-center justify-between rounded-xl border border-slate-100 hover:border-slate-200 bg-white p-3 text-xs font-semibold text-sgvu-navy shadow-sm transition">
                <span className="flex items-center gap-2">
                  <UploadCloud className="h-4 w-4 text-blue-600" />
                  LMS Lesson Plans Audit
                </span>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-muted-foreground">ZIP</span>
              </button>
            </div>
          </HodPanel>
        </div>
      </div>
    </HodPageFrame>
  );
}
