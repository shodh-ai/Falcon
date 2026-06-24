'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2, Plus, Upload, CheckCircle2, Trash2, Clock } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
} from '@/components/faculty';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';

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

  const [submitting, setSubmitting] = useState(false);

  // My tests state
  const [myTests, setMyTests] = useState<any[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);

  const fetchMyTests = async () => {
    try {
      const data = await api.get<any[]>('/api/weekly-tests/faculty');
      setMyTests(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTests(false);
    }
  };

  useEffect(() => {
    fetchMyTests();
  }, []);

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('Are you sure you want to delete this test? It will be permanently removed for all students.')) return;
    try {
      await api.del(`/api/weekly-tests/faculty/${testId}`);
      toast.success('Test deleted successfully');
      fetchMyTests();
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete test');
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
    if (!startTime || !endTime) return toast.error('Please select start and end times.');
    if (new Date(startTime) >= new Date(endTime)) return toast.error('End time must be after start time.');
    if (!file) return toast.error('Please upload a PDF question paper.');
    if (!isAnswerKeyComplete) return toast.error('Please complete the answer key for all 10 questions.');

    setSubmitting(true);
    try {
      toast.info('Uploading question paper...');
      const paperUrl = await handleFileUpload(file);

      toast.info('Scheduling test...');
      await api.post('/api/weekly-tests/faculty/create', {
        course_id: courseId,
        test_type: testType,
        question_paper_url: paperUrl,
        answer_key: answerKey,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
      });

      toast.success('Weekly test scheduled successfully!');

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
        description="Schedule Weekly Tests (WT1, WT2) with automated grading. Tests open securely in full-screen for students."
        meta={null}
      />

      <div className="max-w-4xl mx-auto space-y-6">
        <FacultyPanel title="Schedule New Test" description="Configure details and upload the paper">
          <div className="grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">Course</span>
                <select
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
                </select>
              </label>

              <label className="text-sm">
                <span className="mb-1.5 block font-medium text-sgvu-navy">Test Type</span>
                <select
                  className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
                  value={testType}
                  onChange={(e) => setTestType(e.target.value as any)}
                >
                  {TEST_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
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
                      <DialogTitle>Provide Answer Key</DialogTitle>
                      <DialogDescription>
                        Select the correct option (A, B, C, or D) for each of the 10 questions.
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

        <FacultyPanel title="Manage Scheduled Tests" description="View and delete upcoming tests you have scheduled">
          {loadingTests ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : myTests.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              You haven't scheduled any tests yet.
            </div>
          ) : (
            <div className="grid gap-4 mt-4">
              {myTests.map((test) => {
                const isUpcoming = new Date(test.start_time) > new Date();
                return (
                  <div key={test.test_id} className="rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sgvu-navy">{test.course_code}</span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded border">{test.test_type}</span>
                      </div>
                      <p className="text-sm font-medium text-sgvu-navy">{test.course_name}</p>
                      <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>Starts: {new Date(test.start_time).toLocaleString()}</span>
                      </div>
                    </div>
                    <div>
                      {isUpcoming ? (
                        <Button variant="destructive" size="sm" onClick={() => handleDeleteTest(test.test_id)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Test
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic px-2">Already started/completed</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </FacultyPanel>
      </div>
    </FacultyPageShell>
  );
}
