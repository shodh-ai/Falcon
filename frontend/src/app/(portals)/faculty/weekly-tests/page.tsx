'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2, Plus, Upload, CheckCircle2, Trash2, Clock, Eye, EyeOff, BarChart3 } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
} from '@/components/faculty';
import { FacultyQuestionBankPanel } from '@/components/faculty/FacultyQuestionBankPanel';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { isEmptyArray, isFacultyDemoEntityId, isFacultyDemoSmokeId, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoWeeklyTests } from '@/lib/mock/faculty-portal-demo';
import { cn } from '@/lib/utils';

const TEST_TYPES = ['WT1', 'WT2'] as const;

export default function FacultyWeeklyTestsPage() {
  const api = useAuthedApi();
  const { courses, loading: coursesLoading } = useFacultyCourses();

  const [courseId, setCourseId] = useState('');
  const [testType, setTestType] = useState<(typeof TEST_TYPES)[number]>('WT1');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Answer key array, length 10
  const [answerKey, setAnswerKey] = useState<string[]>(Array(10).fill(''));
  const [isAnswerKeyModalOpen, setIsAnswerKeyModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        const newAnswerKey = [...answerKey];
        let count = 0;
        
        for (const row of data) {
          if (!row || !row.length) continue;
          
          let qNum = -1;
          let opt = '';
          
          for (const cell of row) {
            const strCell = String(cell).trim().toUpperCase();
            if (/^Q?\s*(\d+)$/.test(strCell)) {
              const num = parseInt(strCell.replace(/[^0-9]/g, ''), 10);
              if (num >= 1 && num <= 10) {
                qNum = num - 1;
              }
            } else if (['A', 'B', 'C', 'D'].includes(strCell)) {
              opt = strCell;
            }
          }
          
          if (qNum !== -1 && opt) {
            newAnswerKey[qNum] = opt;
            count++;
          }
        }
        
        if (count === 0) {
          let index = 0;
          for (const row of data) {
            for (const cell of row) {
               const strCell = String(cell).trim().toUpperCase();
               if (['A', 'B', 'C', 'D'].includes(strCell)) {
                  if (index < 10) {
                    newAnswerKey[index] = strCell;
                    index++;
                    count++;
                  }
               }
            }
          }
        }
        
        setAnswerKey(newAnswerKey);
        if (count > 0) {
           toast.success(`Successfully parsed answers from Excel sheet`);
        } else {
           toast.error('Could not find answers (A, B, C, D) in the uploaded Excel sheet.');
        }
      } catch (error) {
        console.error(error);
        toast.error('Failed to parse Excel file');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // My tests state
  const [myTests, setMyTests] = useState<any[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [results, setResults] = useState<{
    test: { course_code?: string; course_name?: string; test_type?: string };
    responses: Array<{
      student_name: string;
      student_email?: string;
      score: number;
      submitted_at?: string;
      violation_count?: number;
    }>;
  } | null>(null);

  const fetchMyTests = async () => {
    try {
      const data = await api.get<any[]>('/api/weekly-tests/faculty');
      setMyTests(withFacultyDemoFallback(data, facultyDemoWeeklyTests(), isEmptyArray));
    } catch (e) {
      console.error(e);
      setMyTests(withFacultyDemoFallback([], facultyDemoWeeklyTests(), isEmptyArray));
    } finally {
      setLoadingTests(false);
    }
  };

  useEffect(() => {
    fetchMyTests();
  }, []);

  async function openResults(testId: string) {
    setResultsOpen(true);
    setResultsLoading(true);
    try {
      const data = await api.get<{
        test: { course_code?: string; course_name?: string; test_type?: string };
        responses: Array<{
          student_name: string;
          student_email?: string;
          score: number;
          submitted_at?: string;
          violation_count?: number;
        }>;
      }>(`/api/weekly-tests/faculty/${testId}/results`);
      setResults(data);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load results');
      setResults(null);
    } finally {
      setResultsLoading(false);
    }
  }

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Are you sure you want to delete this test? It will be permanently removed for all students.')) return;
    if (isFacultyDemoSmokeId(testId)) {
      setMyTests((prev) => prev.filter((t) => t.test_id !== testId));
      toast.success('Test deleted successfully (demo)');
      return;
    }
    try {
      await api.del(`/api/weekly-tests/faculty/${testId}`);
      toast.success('Test deleted successfully');
      fetchMyTests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete test');
    }
  };

  const handleToggleTest = async (testId: string, isActive: boolean) => {
    if (isFacultyDemoSmokeId(testId)) {
      setMyTests((prev) =>
        prev.map((t) => (t.test_id === testId ? { ...t, is_active: !isActive } : t)),
      );
      toast.success(`Test ${!isActive ? 'activated' : 'deactivated'} successfully (demo)`);
      return;
    }
    try {
      await api.patch(`/api/weekly-tests/faculty/${testId}/toggle`, { is_active: !isActive });
      toast.success(`Test ${!isActive ? 'activated' : 'deactivated'} successfully`);
      fetchMyTests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to toggle test status');
    }
  };

  // Upload utility
  const handleFileUpload = async (f: File) => {
    const formData = new FormData();
    formData.append('file', f);
    const res = await api.post<{ url: string }>('/api/uploads/single', formData);
    return res.url;
  };

  const isAnswerKeyComplete = answerKey.every(a => a !== '');

  async function handleSchedule() {
    if (!courseId) return toast.error('Please select a course.');
    if (isFacultyDemoEntityId(courseId)) {
      toast.success('Weekly test scheduled (demo)');
      return;
    }
    if (!startTime || !endTime) return toast.error('Please select start and end times.');
    if (new Date(startTime) >= new Date(endTime)) return toast.error('End time must be after start time.');
    if (!file) return toast.error('Please upload a PDF question paper.');
    if (!isAnswerKeyComplete) return toast.error('Please complete the answer key for all 10 questions.');

    setSubmitting(true);
    try {
      toast.info('Uploading question paper...');
      const paperUrl = await handleFileUpload(file);

      toast.info('Scheduling test...');
      const created = await api.post<{ notified_count?: number }>('/api/weekly-tests/faculty/create', {
        course_id: courseId,
        test_type: testType,
        question_paper_url: paperUrl,
        answer_key: answerKey,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      });

      const notified = Number(created?.notified_count ?? 0);
      toast.success(
        `Weekly test scheduled successfully. Notifications sent to ${notified} student${notified === 1 ? '' : 's'}.`,
      );

      // Reset form
      setCourseId('');
      setStartTime('');
      setEndTime('');
      setFile(null);
      setAnswerKey(Array(10).fill(''));

      // Refresh tests list
      fetchMyTests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to schedule test');
    } finally {
      setSubmitting(false);
    }
  }

  // Answer Key Table UI
  // Render 5 columns, 2 rows
  const renderAnswerKeyTable = () => {
    const rows = [
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9]
    ];

    return (
      <div className="overflow-x-auto w-full py-4">
        <table className="w-full text-sm">
          <tbody>
            {rows.map((rowArr, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/40">
                {rowArr.map(qIndex => (
                  <td key={qIndex} className="p-3 align-top border-r last:border-0 border-border/40">
                    <div className="font-semibold text-sgvu-navy mb-2 flex items-center justify-between">
                      <span>Q{qIndex + 1}</span>
                      {answerKey[qIndex] && (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {['A', 'B', 'C', 'D'].map(opt => (
                        <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="radio"
                            name={`q${qIndex}`}
                            value={opt}
                            checked={answerKey[qIndex] === opt}
                            onChange={() => {
                              const newKey = [...answerKey];
                              newKey[qIndex] = opt;
                              setAnswerKey(newKey);
                            }}
                            className="w-4 h-4 text-sgvu-navy focus:ring-sgvu-navy"
                          />
                          <span className="text-muted-foreground group-hover:text-foreground transition-colors">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Weekly Tests"
        description="Schedule weekly tests and manage automated grading for your courses."
        meta={null}
      />

      <div className="w-full space-y-6">
        <FacultyPanel title="Schedule New Test" description="Configure details and upload the paper" className="w-full">
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">Course</span>
                <Select
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  value={courseId}
                  onChange={(e) => setCourseId(e.target.value)}
                  disabled={coursesLoading}
                >
                  <option value="">Select course</option>
                  {courses.map((c) => (
                    <option key={c.course_id} value={c.course_id}>
                      {c.course_code} — {c.course_name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">Test Type</span>
                <Select
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  value={testType}
                  onChange={(e) => setTestType(e.target.value as any)}
                >
                  {TEST_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </Select>
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">Start Time</span>
                <Input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">End Time</span>
                <Input
                  type="datetime-local"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/40">
              <div className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">Question Paper (PDF)</span>
                <div className="flex items-center gap-2">
                  <Input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="text-sm flex flex-col justify-end">
                <span className="mb-1.5 block font-medium text-sgvu-navy opacity-0">Answer Key</span>
                <Dialog open={isAnswerKeyModalOpen} onOpenChange={setIsAnswerKeyModalOpen}>
                  <DialogTrigger asChild>
                    <Button variant={isAnswerKeyComplete ? "default" : "outline"} className="w-full justify-between">
                      <span className="flex items-center gap-2">
                        {isAnswerKeyComplete ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {isAnswerKeyComplete ? 'Answer Key Complete' : 'Upload Answer Key'}
                      </span>
                      <span className="text-xs opacity-70">
                        {answerKey.filter(a => a !== '').length}/10
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle className="flex justify-between items-center mr-6">
                        <span>Provide Answer Key</span>
                        <div className="flex gap-2 items-center">
                          <input 
                            type="file" 
                            accept=".xlsx, .xls, .csv" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={handleExcelUpload} 
                          />
                          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Excel Sheet
                          </Button>
                        </div>
                      </DialogTitle>
                      <DialogDescription>
                        Select the correct option (A, B, C, or D) for each of the 10 questions, or upload an Excel sheet to map them automatically.
                      </DialogDescription>
                    </DialogHeader>

                    {renderAnswerKeyTable()}

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsAnswerKeyModalOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => setIsAnswerKeyModalOpen(false)}
                        disabled={!isAnswerKeyComplete}
                      >
                        Submit Answer Key
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="flex justify-end pt-4 mt-2 border-t border-border/40">
              <Button onClick={handleSchedule} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Schedule Test
              </Button>
            </div>
          </div>
        </FacultyPanel>

        <FacultyPanel title="Manage Scheduled Tests" description="View and delete upcoming tests you have scheduled" className="w-full">
          {loadingTests ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : myTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              You haven't scheduled any tests yet.
            </div>
          ) : (
            <div className="mt-4 grid w-full grid-cols-1 gap-4">
              {myTests.map((test) => {
                const now = new Date();
                const startTime = new Date(test.start_time);
                const endTime = new Date(test.end_time);

                const isUpcoming = now < startTime;
                const isCompleted = now > endTime;
                const isActiveTest = now >= startTime && now <= endTime;

                // Always border-2 so every card keeps the same outer width
                let cardStyle = 'border-2 border-border bg-background';
                if (isCompleted) cardStyle = 'border-2 border-green-500 bg-green-50/50';
                else if (isActiveTest) cardStyle = 'border-2 border-yellow-500 bg-yellow-50/50';
                else if (isUpcoming) cardStyle = 'border-2 border-red-500 bg-red-50/50';

                return (
                  <div
                    key={test.test_id}
                    className={cn(
                      'box-border grid w-full min-h-[8.5rem] max-w-full gap-3 rounded-xl p-4',
                      'sm:grid-cols-[minmax(0,1fr)_16.5rem] sm:items-center',
                      cardStyle,
                    )}
                  >
                    <div className="min-w-0 w-full">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="font-semibold text-sgvu-navy">{test.course_code}</span>
                        <span className="rounded border bg-muted px-2 py-0.5 text-xs">{test.test_type}</span>
                      </div>
                      <p className="truncate text-sm font-medium text-sgvu-navy">{test.course_name}</p>
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Starts: {new Date(test.start_time).toLocaleString()}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Responses: {test.response_count ?? 0}
                        {test.avg_score != null ? ` · Avg score: ${test.avg_score}` : ''}
                      </p>
                    </div>

                    {/* Fixed-width action column — identical on every card */}
                    <div className="grid h-full w-full shrink-0 grid-rows-[auto_auto] content-center gap-2 sm:w-[16.5rem]">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 w-full justify-center"
                          onClick={() => void openResults(test.test_id)}
                        >
                          <BarChart3 className="mr-1.5 h-4 w-4" />
                          Results
                        </Button>
                        {!isCompleted ? (
                          <Button
                            variant={test.is_active ? 'outline' : 'secondary'}
                            size="sm"
                            className={cn(
                              'h-9 w-full justify-center',
                              !test.is_active && 'border-orange-200 bg-orange-50 text-orange-600',
                            )}
                            onClick={() => handleToggleTest(test.test_id, test.is_active)}
                          >
                            {test.is_active ? (
                              <EyeOff className="mr-1.5 h-4 w-4" />
                            ) : (
                              <Eye className="mr-1.5 h-4 w-4" />
                            )}
                            {test.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        ) : (
                          <div className="h-9" aria-hidden />
                        )}
                      </div>

                      {isUpcoming ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-9 w-full justify-center"
                          onClick={() => handleDeleteTest(test.test_id)}
                        >
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Delete Test
                        </Button>
                      ) : (
                        <span
                          className={cn(
                            'flex h-9 w-full items-center justify-center rounded-md border text-xs font-semibold',
                            isActiveTest
                              ? 'border-yellow-200 bg-yellow-100 text-yellow-700'
                              : 'border-green-200 bg-green-100 text-green-700',
                          )}
                        >
                          {isActiveTest ? 'Currently Active' : 'Completed'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </FacultyPanel>

        <div className="w-full space-y-3">
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href="/faculty/question-bank">Open full Question Bank</Link>
            </Button>
          </div>
          <FacultyQuestionBankPanel compact />
        </div>
      </div>

      <Dialog open={resultsOpen} onOpenChange={setResultsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Test results</DialogTitle>
            <DialogDescription>
              {results?.test
                ? `${results.test.course_code ?? ''} ${results.test.test_type ?? ''} — ${results.test.course_name ?? ''}`
                : 'Student submissions and scores'}
            </DialogDescription>
          </DialogHeader>
          {resultsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !results?.responses?.length ? (
            <p className="text-sm text-muted-foreground">No submissions yet.</p>
          ) : (
            <div className="max-h-[50vh] overflow-auto">
              <div className="min-w-0 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-2">Student</th>
                    <th className="py-2 pr-2">Score</th>
                    <th className="py-2 pr-2">Submitted</th>
                    <th className="py-2">Violations</th>
                  </tr>
                </thead>
                <tbody>
                  {results.responses.map((row, idx) => (
                    <tr key={`${row.student_name}-${idx}`} className="border-b border-border/40">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-sgvu-navy">{row.student_name}</p>
                        {row.student_email ? (
                          <p className="text-xs text-muted-foreground">{row.student_email}</p>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2">{row.score}</td>
                      <td className="py-2 pr-2">
                        {row.submitted_at ? new Date(row.submitted_at).toLocaleString('en-IN') : '—'}
                      </td>
                      <td className="py-2">{row.violation_count ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FacultyPageShell>
  );
}
