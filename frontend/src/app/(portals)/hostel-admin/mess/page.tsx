'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { toast } from '@/lib/notifications/falcon-toast';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;

type MealPlan = Record<string, Record<string, string>>;

export default function HostelMessPage() {
  const api = useAuthedApi();
  const [plan, setPlan] = useState<MealPlan>({});
  const [alternatives, setAlternatives] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    void api.get<{ meal_plan: MealPlan; alternative_options?: string; special_notes?: string } | null>(
      '/api/hostel-admin/mess/menu',
    ).then((m) => {
      if (m?.meal_plan) setPlan(m.meal_plan);
      if (m?.alternative_options) setAlternatives(m.alternative_options);
      if (m?.special_notes) setNotes(m.special_notes ?? '');
    });
  }, [api]);

  function setCell(day: string, meal: string, value: string) {
    setPlan((p) => ({
      ...p,
      [day]: { ...(p[day] ?? {}), [meal]: value },
    }));
  }

  async function save() {
    const start = new Date();
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(start.setDate(diff));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    try {
      await api.post('/api/hostel-admin/mess/menu', {
        week_start_date: weekStart.toISOString().slice(0, 10),
        week_end_date: weekEnd.toISOString().slice(0, 10),
        meal_plan: plan,
        alternative_options: alternatives,
        special_notes: notes,
      });
      toast.success('Weekly mess menu saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Mess Management</h1>
      <p className="text-sm text-muted-foreground">Weekly menu builder — 4 meals × 7 days</p>

      <div className="overflow-x-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left">Day</th>
              {MEALS.map((m) => (
                <th key={m} className="px-3 py-2 capitalize">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day) => (
              <tr key={day} className="border-t">
                <td className="px-3 py-2 font-medium capitalize">{day}</td>
                {MEALS.map((meal) => (
                  <td key={meal} className="px-2 py-1">
                    <Input
                      className="h-8 text-xs"
                      value={plan[day]?.[meal] ?? ''}
                      onChange={(e) => setCell(day, meal, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Alternative Options</label>
        <Input
          placeholder="Bread Pakoda / Fried Idli / Fruit Bowl"
          value={alternatives}
          onChange={(e) => setAlternatives(e.target.value)}
        />
        <label className="text-sm font-medium">Special Notes</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button className="bg-sgvu-navy" onClick={() => void save()}>
        Save Weekly Menu
      </Button>
    </div>
  );
}
