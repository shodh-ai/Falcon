'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, MessageSquare, Video } from 'lucide-react';
import { FacultyPanel, FacultyEmptyState } from '@/components/faculty';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

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
  meetingLink: z.string().trim().url('Enter a valid meeting URL'),
});

const forumThreadSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters'),
  content: z.string().trim().min(10, 'Post must be at least 10 characters'),
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

  const livePanel = (
    <FacultyPanel
      title="Live virtual classes"
      count={liveClasses.length}
      description={mode === 'faculty' ? 'Schedule a Meet or Zoom link for this course' : undefined}
    >
      <div className="space-y-3">
        {liveClasses.length === 0 ? (
          <FacultyEmptyState
            title="No live sessions scheduled"
            description={
              mode === 'faculty'
                ? 'Paste a meeting link below to schedule a session.'
                : 'Check back when your faculty schedules a live class.'
            }
            className="py-6"
          />
        ) : (
          liveClasses.map((lc) => (
            <div
              key={lc.live_class_id}
              className="rounded-xl border border-border/60 bg-muted/20 p-3 text-sm"
            >
              <div className="flex items-start gap-2">
                <Video className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
                <div>
                  <p className="font-medium text-sgvu-navy">{lc.title}</p>
                  <p className="text-muted-foreground">{new Date(lc.starts_at).toLocaleString()}</p>
                </div>
              </div>
              {mode === 'student' && (
                <Button size="sm" className="mt-2" asChild>
                  <a href={lc.meeting_url} target="_blank" rel="noreferrer">Join now</a>
                </Button>
              )}
            </div>
          ))
        )}
        {mode === 'faculty' && (
          <form className="space-y-3 border-t border-border/50 pt-3" onSubmit={liveForm.handleSubmit(onCreateLiveClass)}>
            <Input
              placeholder="Google Meet / Zoom URL"
              {...liveForm.register('meetingLink')}
            />
            {liveForm.formState.errors.meetingLink && (
              <p className="text-xs text-destructive">{liveForm.formState.errors.meetingLink.message}</p>
            )}
            <Button type="submit" disabled={!liveValid || submittingLive} className="gap-1.5">
              {submittingLive ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Schedule live class
            </Button>
          </form>
        )}
      </div>
    </FacultyPanel>
  );

  const forumPanel = (
    <FacultyPanel title="Course forum" count={threads.length} description="Q&A and discussions with students">
      <div className="space-y-3">
        {threads.length === 0 ? (
          <FacultyEmptyState
            title="No discussion threads yet"
            description="Start a thread to answer student questions."
            className="py-6"
          />
        ) : (
          threads.map((t) => (
            <div
              key={t.thread_id}
              className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm"
            >
              <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-sgvu-gold" />
              <div>
                <p className="font-medium text-sgvu-navy">{t.title}</p>
                <p className="text-muted-foreground">{t.author_name} · ▲ {t.upvotes}</p>
              </div>
            </div>
          ))
        )}
        <form className="space-y-3 border-t border-border/50 pt-3" onSubmit={forumForm.handleSubmit(onCreateThread)}>
          <Input placeholder="Thread title" {...forumForm.register('title')} />
          {forumForm.formState.errors.title && (
            <p className="text-xs text-destructive">{forumForm.formState.errors.title.message}</p>
          )}
          <Input placeholder="Question / post" {...forumForm.register('content')} />
          {forumForm.formState.errors.content && (
            <p className="text-xs text-destructive">{forumForm.formState.errors.content.message}</p>
          )}
          <Button type="submit" variant="outline" disabled={!forumValid || submittingForum} className="gap-1.5">
            {submittingForum ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Post to forum
          </Button>
        </form>
      </div>
    </FacultyPanel>
  );

  if (mode === 'student') {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {livePanel}
        {forumPanel}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {livePanel}
      {forumPanel}
    </div>
  );
}
