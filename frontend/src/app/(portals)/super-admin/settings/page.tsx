'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Row = { country_id?: number; state_id?: number; name: string; code?: string };

export default function SuperAdminSettingsPage() {
  const api = useAuthedApi();
  const [countries, setCountries] = useState<Row[]>([]);
  const [castes, setCastes] = useState<Row[]>([]);
  const [rules, setRules] = useState<{ rule_id: string; rule_name: string; template: string }[]>([]);
  const [countryName, setCountryName] = useState('');
  const [casteName, setCasteName] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [ruleTemplate, setRuleTemplate] = useState('[YEAR][DEPT][SEQ]');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [c, ca, r] = await Promise.all([
          api.get<Row[]>('/api/master-data/countries'),
          api.get<Row[]>('/api/master-data/castes'),
          api.get<{ rule_id: string; rule_name: string; template: string }[]>(
            '/api/master-data/enrollment-rules',
          ),
        ]);
        setCountries(c);
        setCastes(ca);
        setRules(r);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load master settings');
      }
    })();
  }, [api]);

  async function addCountry(e: FormEvent) {
    e.preventDefault();
    await api.post('/api/master-data/countries', { name: countryName });
    toast.success('Country added');
    setCountryName('');
    setCountries(await api.get('/api/master-data/countries'));
  }

  async function addCaste(e: FormEvent) {
    e.preventDefault();
    await api.post('/api/master-data/castes', { name: casteName });
    toast.success('Caste added');
    setCasteName('');
    setCastes(await api.get('/api/master-data/castes'));
  }

  async function addRule(e: FormEvent) {
    e.preventDefault();
    await api.post('/api/master-data/enrollment-rules', { rule_name: ruleName, template: ruleTemplate });
    toast.success('Enrollment rule saved');
    setRuleName('');
    setRules(await api.get('/api/master-data/enrollment-rules'));
  }

  async function testRule(ruleId: string) {
    const result = await api.post<{ enrollment_id: string }>(`/api/master-data/enrollment-rules/${ruleId}/generate`, {
      context: { YEAR: '2026', DEPT: 'CSE' },
    });
    setPreview(result.enrollment_id);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Master Configuration</h1>
        <p className="text-sm text-muted-foreground">Country/State/City, caste/category/religion, and enrollment ID rules.</p>
      </div>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-bold text-sgvu-navy">Countries</h2>
        <form onSubmit={addCountry} className="flex gap-2">
          <Input placeholder="Country name" value={countryName} onChange={(e) => setCountryName(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
        <ul className="text-sm">{countries.map((c) => <li key={c.country_id}>{c.name}</li>)}</ul>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-bold text-sgvu-navy">Caste / Category (scholarship tracking)</h2>
        <form onSubmit={addCaste} className="flex gap-2">
          <Input placeholder="Caste name" value={casteName} onChange={(e) => setCasteName(e.target.value)} />
          <Button type="submit">Add caste</Button>
        </form>
        <ul className="text-sm">{castes.map((c, i) => <li key={i}>{c.name}</li>)}</ul>
      </section>

      <section className="rounded-xl border p-4 space-y-3">
        <h2 className="font-bold text-sgvu-navy">Enrollment / PRN rule builder</h2>
        <p className="text-xs text-muted-foreground">Example: [YEAR][DEPT][SEQ] → 2026CSE001</p>
        <form onSubmit={addRule} className="grid gap-2 sm:grid-cols-2">
          <Input placeholder="Rule name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
          <Input placeholder="Template" value={ruleTemplate} onChange={(e) => setRuleTemplate(e.target.value)} />
          <Button type="submit" className="sm:col-span-2">Save rule</Button>
        </form>
        <ul className="space-y-2 text-sm">
          {rules.map((r) => (
            <li key={r.rule_id} className="flex items-center justify-between gap-2">
              <span>{r.rule_name}: <code>{r.template}</code></span>
              <Button size="sm" variant="outline" onClick={() => void testRule(r.rule_id)}>Test</Button>
            </li>
          ))}
        </ul>
        {preview ? <p className="text-sm font-mono">Preview: {preview}</p> : null}
      </section>
    </div>
  );
}
