'use client';

import { use, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2, Maximize, AlertTriangle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/api-base-url';

export default function AttemptTestPage({ params }: { params: Promise<{ testId: string }> }) {
  const router = useRouter();
  const api = useAuthedApi();
  const { user } = useAuth();
  
  const { testId } = use(params);
  
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [warnings, setWarnings] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [answers, setAnswers] = useState<string[]>(Array(10).fill(''));
  const [isLocked, setIsLocked] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<any>(`/api/weekly-tests/student/${testId}`);
        if (!data) {
          toast.error("Test not found or no longer active.");
          router.replace('/student/weekly-tests');
          return;
        }
        if (!cancelled) setTest(data);
      } catch (e: any) {
        toast.error(e.message || "Failed to load test details.");
        router.replace('/student/weekly-tests');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [api, testId, router]);

  const submitTest = useCallback(async (isAutoSubmit: boolean = false) => {
    if (submitting) return;
    setSubmitting(true);
    toast.info(isAutoSubmit ? 'Auto-submitting test...' : 'Submitting test...');
    try {
      await api.post(`/api/weekly-tests/student/${testId}/submit`, {
        answers: answers,
        violation_count: warnings
      });
      toast.success('Test submitted successfully!');
      
      // Exit fullscreen if active
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      }
      
      router.replace('/student/weekly-tests');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit test');
      setSubmitting(false); // only allow retry if it wasn't auto submit
      if (isAutoSubmit) {
        router.replace('/student/weekly-tests');
      }
    }
  }, [api, testId, answers, submitting, router]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);

      if (hasStarted && !isFs && !submitting) {
        setWarnings(prev => {
          const newWarnings = prev + 1;
          if (newWarnings === 1) {
            toast.error("WARNING: You exited full-screen mode. One more violation will auto-submit your test.", { duration: 10000 });
          } else if (newWarnings >= 2) {
            toast.error("VIOLATION: Full-screen exited multiple times. Auto-submitting test.");
            submitTest(true);
          }
          return newWarnings;
        });
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [hasStarted, submitting, submitTest]);

  const startTest = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setHasStarted(true);
    } catch (err) {
      toast.error("Failed to enter full-screen mode. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  if (!test) return null;

  if (!hasStarted) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted/30 p-4">
        <div className="max-w-md w-full bg-background border rounded-xl shadow-lg p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-sgvu-navy">Strict Proctoring Enabled</h1>
          <p className="text-muted-foreground text-sm">
            This test requires full-screen mode. If you exit full-screen mode, you will receive one warning. A second violation will automatically submit your test.
          </p>
          <div className="bg-muted p-4 rounded-lg text-left space-y-2 text-sm">
            <p><strong>Course:</strong> {test.course_code} - {test.course_name}</p>
            <p><strong>Test Type:</strong> {test.test_type}</p>
          </div>
          <Button onClick={startTest} className="w-full h-12 text-lg">
            <Maximize className="w-5 h-5 mr-2" />
            Enter Full Screen & Start
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-background w-full h-screen flex flex-col overflow-hidden text-foreground">
      {/* Header */}
      <header className="h-14 border-b flex items-center justify-between px-6 bg-sgvu-navy text-white shrink-0">
        <div className="flex items-center gap-4">
          <span className="font-bold">{test.course_code} - {test.test_type}</span>
          {warnings > 0 && (
            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded font-bold animate-pulse">
              WARNING: 1 Violation
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm opacity-90">{user?.name}</span>
          <Button size="sm" variant="destructive" onClick={() => submitTest(false)} disabled={submitting}>
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Submit Test
          </Button>
        </div>
      </header>

      {/* Main Content: Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* PDF Viewer (Left) */}
        <div className="flex-1 border-r bg-muted/20 relative">
          <iframe 
            src={`${getApiBaseUrl()}/api/uploads/download?path=${encodeURIComponent(test.question_paper_url)}&t=${Date.now()}#toolbar=0`} 
            className="w-full h-full border-0" 
            title="Question Paper"
            onLoad={() => {
              // Iframe loaded
            }}
          />
        </div>

        {/* OMR Sheet (Right) */}
        <div className="w-80 bg-background overflow-y-auto p-6 flex flex-col shrink-0">
          <h2 className="font-bold text-lg text-sgvu-navy border-b pb-2 mb-4">OMR Sheet</h2>
          
          <div className="mb-6">
            <div className="flex justify-between text-xs font-medium mb-1">
              <span className="text-green-600">{answers.filter(a => a !== '').length} Attempted</span>
              <span className="text-yellow-600">{answers.filter(a => a === '').length} Unattempted</span>
            </div>
            <div className="h-2 w-full bg-yellow-400 rounded-full overflow-hidden flex">
              <div 
                className="h-full bg-green-500 transition-all duration-300" 
                style={{ width: `${(answers.filter(a => a !== '').length / 10) * 100}%` }}
              />
            </div>
          </div>
          
          <div className="space-y-6 flex-1">
            {answers.map((ans, idx) => (
              <div key={idx} className="flex items-center gap-4 p-3 rounded-lg border bg-muted/10 hover:bg-muted/30 transition-colors">
                <span className="font-semibold text-sgvu-navy w-6 text-right shrink-0">{idx + 1}.</span>
                <div className="flex gap-2 flex-1 justify-between">
                  {['A', 'B', 'C', 'D'].map(opt => (
                    <label key={opt} className={`
                      flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all
                      ${ans === opt 
                        ? 'bg-sgvu-navy border-sgvu-navy text-white shadow-md' 
                        : 'border-border text-muted-foreground hover:border-sgvu-navy hover:text-sgvu-navy'}
                      ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}>
                      <input
                        type="radio"
                        name={`q${idx}`}
                        value={opt}
                        checked={ans === opt}
                        disabled={isLocked}
                        onChange={() => {
                          if (isLocked) return;
                          const newAns = [...answers];
                          newAns[idx] = opt;
                          setAnswers(newAns);
                        }}
                        className="sr-only"
                      />
                      <span className="font-medium">{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          <div className="pt-6 mt-6 border-t">
            <Button className="w-full" size="lg" onClick={() => setIsLocked(true)} disabled={isLocked || submitting}>
              {isLocked ? 'Options Locked' : 'Final Submit'}
            </Button>
            <p className="text-xs text-center text-muted-foreground mt-3">
              Ensure you have marked all 10 answers before submitting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
