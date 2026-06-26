import type { NavItem } from '@/lib/navigation';
import {
  Banknote,
  CheckSquare,
  ScrollText,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export type LeadershipSearchShortcut = NavItem & {
  aliases?: string[];
};

/** Instant Cmd+K shortcuts for Chairman — client-side, no API required */
export const LEADERSHIP_SEARCH_SHORTCUTS: LeadershipSearchShortcut[] = [
  {
    label: 'CS / Engineering Budget',
    href: '/leadership/budget-allocation',
    icon: Banknote,
    keywords: ['cs budget', 'engineering budget', 'department budget', 'allocate'],
    aliases: ['cs budget', 'engineering', 'cse budget'],
  },
  {
    label: 'First Year Defaulters',
    href: '/leadership/finance#defaulters',
    icon: Wallet,
    keywords: ['defaulters', 'first year', 'outstanding fees', 'fee dues'],
    aliases: ['defaulters', 'first year defaulters', 'fee defaulters'],
  },
  {
    label: 'Approve Purchase Orders',
    href: '/leadership/approvals',
    icon: CheckSquare,
    keywords: ['approve po', 'purchase order', 'pending approval'],
    aliases: ['approve po', 'approvals', 'sign off'],
  },
  {
    label: 'Chairman Memo',
    href: '/leadership/memos',
    icon: ScrollText,
    keywords: ['memo', 'directive', 'confidential'],
    aliases: ['memo', 'chairman memo', 'send memo'],
  },
  {
    label: 'Financial Oversight Dashboard',
    href: '/leadership/financial-oversight',
    icon: TrendingUp,
    keywords: ['treasury', 'cash position', 'budget utilization'],
    aliases: ['financial oversight', 'treasury', 'cash in bank'],
  },
  {
    label: 'Budget Monitor Drill-Down',
    href: '/leadership/budget-monitor',
    icon: Banknote,
    keywords: ['budget monitor', 'sankey', 'utilization'],
    aliases: ['budget monitor', 'department utilization'],
  },
];

export function matchLeadershipShortcuts(query: string): LeadershipSearchShortcut[] {
  const q = query.trim().toLowerCase();
  if (!q) return LEADERSHIP_SEARCH_SHORTCUTS.slice(0, 6);
  return LEADERSHIP_SEARCH_SHORTCUTS.filter((item) => {
    if (item.label.toLowerCase().includes(q)) return true;
    if (item.keywords?.some((kw) => kw.toLowerCase().includes(q) || q.includes(kw.toLowerCase()))) return true;
    if (item.aliases?.some((a) => a.toLowerCase().includes(q) || q.includes(a.toLowerCase()))) return true;
    return false;
  });
}

export function isLeadershipRoute(pathname: string | null): boolean {
  return Boolean(pathname?.startsWith('/leadership'));
}
