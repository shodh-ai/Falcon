import type { LucideIcon } from 'lucide-react';

export type EngageHubDestination = {
  id: string;
  href: string;
  label: string;
  intent: string;
  whenToUse: string;
  description: string;
  examples: string[];
  ctaLabel: string;
  icon: LucideIcon;
};

export type EngageHubLiveStat = {
  primary: string;
  secondary?: string;
  highlight?: string;
};
