'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { toast } from 'sonner';

type LiveClass = {
  live_class_id: string;
  title: string;
  meeting_url: string;
  starts_at: string;
  ends_at: string;
};

type Thread = {
  thread_id: string;
  title: string;
  author_name: string;
  upvotes: number;
};

export function LmsExtendedTabs({ courseId, mode }: { courseId: string; mode: 'faculty' | 'student' }) {
  const api = useAuthedApi();
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [meetUrl, setMeetUrl] = useState('https://meet.google.com/demo');
  const [threadTitle, setThreadTitle] = useState('');
  const [threadBody, setThreadBody] = useState('');

  useEffect(() => {
    void api.get<LiveClass[]>(`/api/lms/courses/${courseId}/live-classes`).then(setLiveClasses).catch(() => setLiveClasses([]));
    void api.get<Thread[]>(`/api/lms/courses/${courseId}/forums`).then(setThreads).catch(() => setThreads([]));
    if (mode === 'student') {
      void api.get<LiveClass[]>('/api/lms/live-classes/active').then(setLiveClasses).catch(() => undefined);
    }
  }, [api, courseId, mode]);

  async function createLiveClass() {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    await api.post('/api/lms/live-classes', {
      course_id: courseId,
      title: 'Live session',
      meeting_url: meetUrl,
      starts_at: now.toISOString(),
      ends_at: end.toISOString(),
    });
    toast.success('Live class scheduled');
  }

  async function createThread() {
    await api.post('/api/lms/forums/threads', { course_id: courseId, title: threadTitle, body: threadBody });
    toast.success('Discussion thread created');
    setThreadTitle('');
    setThreadBody('');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live virtual classes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {liveClasses.map((lc) => (
            <div key={lc.live_class_id} className="rounded border p-3 text-sm">
              <p className="font-medium">{lc.title}</p>
              <p className="text-muted-foreground">{new Date(lc.starts_at).toLocaleString()}</p>
              {mode === 'student' && (
                <Button size="sm" className="mt-2" asChild>
                  <a href={lc.meeting_url} target="_blank" rel="noreferrer">Join Now</a>
                </Button>
              )}
            </div>
          ))}
          {mode === 'faculty' && (
            <>
              <Input placeholder="Google Meet / Zoom URL" value={meetUrl} onChange={(e) => setMeetUrl(e.target.value)} />
              <Button onClick={() => void createLiveClass()}>Schedule live class</Button>
            </>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course forum</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {threads.map((t) => (
            <div key={t.thread_id} className="rounded border p-3 text-sm">
              <p className="font-medium">{t.title}</p>
              <p className="text-muted-foreground">{t.author_name} · ▲ {t.upvotes}</p>
            </div>
          ))}
          <Input placeholder="Thread title" value={threadTitle} onChange={(e) => setThreadTitle(e.target.value)} />
          <Input placeholder="Question / post" value={threadBody} onChange={(e) => setThreadBody(e.target.value)} />
          <Button variant="outline" onClick={() => void createThread()}>Post to forum</Button>
        </CardContent>
      </Card>
    </div>
  );
}
