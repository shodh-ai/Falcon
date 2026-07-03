'use client';

import { useState } from 'react';
import { Search, Trophy, Star, Users, Medal, Sun, Handshake, Rocket } from 'lucide-react';

const APPRECIATION_BADGES = [
  { id: 'champion', label: 'Champion', icon: Trophy, color: 'text-amber-500', bg: 'bg-amber-50 border-amber-100' },
  { id: 'above-beyond', label: 'Going Above & Beyond', icon: Star, color: 'text-violet-500', bg: 'bg-violet-50 border-violet-100' },
  { id: 'team-player', label: 'Team Player', icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-100' },
  { id: 'impact', label: 'Making An Impact', icon: Medal, color: 'text-emerald-500', bg: 'bg-emerald-50 border-emerald-100' },
  { id: 'leader', label: 'Inspirational Leader', icon: Sun, color: 'text-orange-500', bg: 'bg-orange-50 border-orange-100' },
  { id: 'thank-you', label: 'Thank You', icon: Handshake, color: 'text-rose-500', bg: 'bg-rose-50 border-rose-100' },
] as const;

type FeedbackSubTab = 'appreciation' | 'one-to-one' | 'continuous';

export function ZimyoAppreciationPanel() {
  const [subTab, setSubTab] = useState<FeedbackSubTab>('appreciation');
  const [direction, setDirection] = useState<'received' | 'given'>('received');
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [period, setPeriod] = useState('This Month');

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex border-b border-slate-100 gap-5 text-xs font-bold text-slate-400">
        {([
          { key: 'appreciation' as FeedbackSubTab, label: 'Appreciation' },
          { key: 'one-to-one' as FeedbackSubTab, label: 'One to One' },
          { key: 'continuous' as FeedbackSubTab, label: 'Continuous Feedback' },
        ]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            className={`pb-3 border-b-2 transition-all ${subTab === key ? 'border-sgvu-navy text-sgvu-navy' : 'border-transparent hover:text-slate-700'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'appreciation' && (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2 h-3.5 w-3.5 text-slate-400" />
              <input
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-sgvu-navy w-44"
                placeholder="Search..."
              />
            </div>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 font-bold text-slate-600 focus:outline-none focus:ring-1 focus:ring-sgvu-navy"
            >
              <option>This Month</option>
              <option>Last Month</option>
              <option>This Quarter</option>
              <option>This Year</option>
            </select>
            <div className="flex bg-slate-100 rounded-lg p-1 gap-1 ml-auto">
              {(['received', 'given'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`px-4 py-1.5 text-xs font-bold rounded-md capitalize transition-all ${direction === d ? 'bg-white text-sgvu-navy shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Badge grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {APPRECIATION_BADGES.map(({ id, label, icon: Icon, color, bg }) => (
              <button
                key={id}
                onClick={() => setSelectedBadge(selectedBadge === id ? null : id)}
                className={`rounded-2xl border p-5 flex flex-col items-center gap-3 transition-all hover:shadow-md ${bg} ${selectedBadge === id ? 'ring-2 ring-sgvu-navy shadow-md' : ''}`}
              >
                <div className={`h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-sm ${color}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <p className="text-xs font-bold text-slate-700 text-center leading-tight">{label}</p>
                <span className="text-lg font-extrabold text-slate-400">0</span>
              </button>
            ))}
          </div>

          {/* Empty state / selected badge detail */}
          {selectedBadge ? (
            <div className="py-8 flex flex-col items-center gap-3 border border-slate-100 rounded-2xl bg-slate-50/40">
              <div className="h-12 w-12 rounded-xl bg-white flex items-center justify-center shadow-sm text-sgvu-navy">
                {(() => {
                  const badge = APPRECIATION_BADGES.find(b => b.id === selectedBadge);
                  if (!badge) return null;
                  const Icon = badge.icon;
                  return <Icon className={`h-6 w-6 ${badge.color}`} />;
                })()}
              </div>
              <p className="text-xs font-bold text-slate-600">
                No {APPRECIATION_BADGES.find(b => b.id === selectedBadge)?.label} appreciations {direction} yet.
              </p>
            </div>
          ) : (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <div className="h-14 w-14 rounded-2xl bg-blue-50 text-blue-300 flex items-center justify-center">
                <Rocket className="h-7 w-7" />
              </div>
              <p className="text-xs font-bold text-slate-500">Click On Any Badge To See Appreciations</p>
            </div>
          )}
        </>
      )}

      {subTab === 'one-to-one' && (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-300 flex items-center justify-center">
            <Users className="h-7 w-7" />
          </div>
          <p className="text-xs font-bold text-slate-500">No One-to-One meetings recorded</p>
        </div>
      )}

      {subTab === 'continuous' && (
        <div className="py-12 flex flex-col items-center gap-3 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-300 flex items-center justify-center">
            <Star className="h-7 w-7" />
          </div>
          <p className="text-xs font-bold text-slate-500">No continuous feedback records</p>
        </div>
      )}
    </div>
  );
}
