'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
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

const liveClassSchema = z.object({
  meetingLink: z.string().url('Enter a valid meeting URL'),
});

const forumThreadSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  content: z.string().min(10, 'Post must be at least 10 characters'),
});

type LiveClassForm = z.infer<typeof liveClassSchema>;
type ForumThreadForm = z.infer<typeof forumThreadSchema>;

export function LmsExtendedTabs({ courseId, mode }: { courseId: string; mode: 'faculty' | 'student' }) {
  const api = useAuthedApi();
  const [liveClasses, setLiveClasses] = useState<LiveClass[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [submittingLive, setSubmittingLive] = useState(false);
  const [submittingForum, setSubmittingForum] = useState(false);

  const liveForm = useForm<LiveClassForm>({
    resolver: zodResolver(liveClassSchema),
    defaultValues: { meetingLink: '' },
    mode: 'onChange',
  });

  const forumForm = useForm<ForumThreadForm>({
    resolver: zodResolver(forumThreadSchema),
    defaultValues: { title: '', content: '' },
    mode: 'onChange',
  });

  useEffect(() => {
    void api.get<LiveClass[]>(`/api/lms/courses/${courseId}/live-classes`).then(setLiveClasses).catch(() => setLiveClasses([]));
    void api.get<Thread[]>(`/api/lms/courses/${courseId}/forums`).then(setThreads).catch(() => setThreads([]));
    if (mode === 'student') {
      void api.get<LiveClass[]>('/api/lms/live-classes/active').then(setLiveClasses).catch(() => undefined);
    }
  }, [api, courseId, mode]);

  async function onCreateLiveClass(values: LiveClassForm) {
    setSubmittingLive(true);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 60 * 60 * 1000);
      await api.post('/api/lms/live-classes', {
        course_id: courseId,
        title: 'Live session',
        meeting_url: values.meetingLink,
        starts_at: now.toISOString(),
        ends_at: end.toISOString(),
      });
      toast.success('Live class scheduled');
      liveForm.reset();
      const updated = await api.get<LiveClass[]>(`/api/lms/courses/${courseId}/live-classes`);
      setLiveClasses(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to schedule live class');
    } finally {
      setSubmittingLive(false);
    }
  }

  async function onCreateThread(values: ForumThreadForm) {
    setSubmittingForum(true);
    try {
      await api.post('/api/lms/forums/threads', {
        course_id: courseId,
        title: values.title,
        body: values.content,
      });
      toast.success('Discussion thread created');
      forumForm.reset();
      const updated = await api.get<Thread[]>(`/api/lms/courses/${courseId}/forums`);
      setThreads(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create thread');
    } finally {
      setSubmittingForum(false);
    }
  }

  const liveValid = liveForm.formState.isValid;
  const forumValid = forumForm.formState.isValid;

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
            <form className="space-y-3" onSubmit={liveForm.handleSubmit(onCreateLiveClass)}>
              <Input
                placeholder="Google Meet / Zoom URL"
                {...liveForm.register('meetingLink')}
              />
              {liveForm.formState.errors.meetingLink && (
                <p className="text-xs text-destructive">{liveForm.formState.errors.meetingLink.message}</p>
              )}
              <Button type="submit" disabled={!liveValid || submittingLive}>
                {submittingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Schedule live class'}
              </Button>
            </form>
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
          <form className="space-y-3" onSubmit={forumForm.handleSubmit(onCreateThread)}>
            <Input placeholder="Thread title" {...forumForm.register('title')} />
            {forumForm.formState.errors.title && (
              <p className="text-xs text-destructive">{forumForm.formState.errors.title.message}</p>
            )}
            <Input placeholder="Question / post" {...forumForm.register('content')} />
            {forumForm.formState.errors.content && (
              <p className="text-xs text-destructive">{forumForm.formState.errors.content.message}</p>
            )}
            <Button type="submit" variant="outline" disabled={!forumValid || submittingForum}>
              {submittingForum ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post to forum'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
