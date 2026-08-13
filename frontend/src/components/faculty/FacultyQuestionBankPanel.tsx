'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FacultyEmptyState, FacultyPanel } from '@/components/faculty';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useAuthedApi } from '@/lib/api';
import {
  isFacultyDemoEntityId,
  isFacultyDemoSmokeId,
} from '@/lib/faculty-demo-mode';

type QuestionBankItem = {
  question_id: string;
  course_id?: string | null;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  tags?: string | null;
  created_at?: string;
};

export function FacultyQuestionBankPanel({
  compact = false,
}: {
  compact?: boolean;
}) {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [courseFilter, setCourseFilter] = useState('');
  const [search, setSearch] = useState('');
  const [courseId, setCourseId] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState({ a: '', b: '', c: '', d: '' });
  const [correct, setCorrect] = useState('A');

  async function reload() {
    setLoading(true);
    try {
      const qs = courseFilter ? `?courseId=${encodeURIComponent(courseFilter)}` : '';
      const data = await api.get<QuestionBankItem[]>(
        `/api/academics/faculty/question-bank${qs}`,
      );
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [api, courseFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.question_text.toLowerCase().includes(q) ||
        item.option_a.toLowerCase().includes(q) ||
        item.option_b.toLowerCase().includes(q) ||
        item.option_c.toLowerCase().includes(q) ||
        item.option_d.toLowerCase().includes(q) ||
        (item.tags ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  async function saveItem() {
    if (!question.trim() || !options.a || !options.b || !options.c || !options.d) {
      toast.error('Fill question and all four options');
      return;
    }
    if (courseId && isFacultyDemoEntityId(courseId)) {
      toast.success('Question saved to bank (demo)');
      setQuestion('');
      setOptions({ a: '', b: '', c: '', d: '' });
      setCorrect('A');
      return;
    }
    setSaving(true);
    try {
      await api.post('/api/academics/faculty/question-bank', {
        course_id: courseId || undefined,
        question_text: question.trim(),
        option_a: options.a.trim(),
        option_b: options.b.trim(),
        option_c: options.c.trim(),
        option_d: options.d.trim(),
        correct_option: correct,
      });
      toast.success('Question saved to bank');
      setQuestion('');
      setOptions({ a: '', b: '', c: '', d: '' });
      setCorrect('A');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(questionId: string) {
    if (!confirm('Delete this question from the bank?')) return;
    if (isFacultyDemoSmokeId(questionId)) {
      setItems((prev) => prev.filter((q) => q.question_id !== questionId));
      toast.success('Question deleted (demo)');
      return;
    }
    setDeletingId(questionId);
    try {
      await api.del(`/api/academics/faculty/question-bank/${questionId}`);
      toast.success('Question deleted');
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  }

  const listLimit = compact ? 12 : filtered.length;

  return (
    <div className="space-y-4">
      <FacultyPanel
        title="Add MCQ"
        description="Reusable questions for weekly tests and quizzes"
      >
        <div className="space-y-3">
          <Select
            className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">All courses (general bank)</option>
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.course_code} — {c.course_name}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Question text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {(['a', 'b', 'c', 'd'] as const).map((key) => (
              <Input
                key={key}
                placeholder={`Option ${key.toUpperCase()}`}
                value={options[key]}
                onChange={(e) => setOptions({ ...options, [key]: e.target.value })}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select
              className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
            >
              {['A', 'B', 'C', 'D'].map((opt) => (
                <option key={opt} value={opt}>
                  Correct: {opt}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={() => void saveItem()} disabled={saving}>
              {saving ? 'Saving…' : 'Add to bank'}
            </Button>
          </div>
        </div>
      </FacultyPanel>

      <FacultyPanel
        title="Saved questions"
        description="Search, filter by course, and remove obsolete items"
        count={filtered.length}
      >
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search questions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            className="rounded-lg border border-border/60 bg-background px-3 py-2 text-sm sm:w-64"
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.course_code}
              </option>
            ))}
          </Select>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <FacultyEmptyState description="No saved questions yet." />
        ) : (
          <div className="space-y-2">
            {filtered.slice(0, listLimit).map((q) => {
              const course = courses.find((c) => c.course_id === q.course_id);
              return (
                <div
                  key={q.question_id}
                  className="flex flex-col gap-2 rounded-lg border border-border/60 p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sgvu-navy">{q.question_text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      A) {q.option_a} · B) {q.option_b} · C) {q.option_c} · D) {q.option_d} ·
                      Correct {q.correct_option}
                    </p>
                    {course ? (
                      <p className="mt-1 text-[11px] font-medium text-sgvu-navy/70">
                        {course.course_code}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={deletingId === q.question_id}
                    onClick={() => void deleteItem(q.question_id)}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Delete
                  </Button>
                </div>
              );
            })}
            {compact && filtered.length > listLimit ? (
              <p className="text-xs text-muted-foreground">
                Showing {listLimit} of {filtered.length}. Open Question Bank for the full list.
              </p>
            ) : null}
          </div>
        )}
      </FacultyPanel>
    </div>
  );
}
