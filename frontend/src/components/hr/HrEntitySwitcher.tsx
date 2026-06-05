'use client';

import { Building2, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useHrEntity } from '@/context/HrEntityContext';

export function HrEntitySwitcher() {
  const { entities, entityId, setEntityId, loading } = useHrEntity();
  const active = entities.find((e) => e.entity_id === entityId);

  if (loading) return null;

  if (!entities || entities.length === 0) {
    return (
      <div className="hidden rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 md:block">
        No Entity Assigned
      </div>
    );
  }

  if (entities.length === 1) {
    const sole = entities[0];
    return (
      <div
        className="hidden h-10 items-center gap-2 rounded-md border bg-muted/40 px-3 md:inline-flex"
        title={sole.entity_code}
      >
        <Building2 className="h-4 w-4 shrink-0 text-sgvu-gold" />
        <span className="max-w-[180px] truncate text-sm font-medium text-foreground">
          {sole.entity_name}
        </span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="hidden h-10 shrink-0 gap-2 md:inline-flex" title="Switch organization entity">
          <Building2 className="h-4 w-4 shrink-0 text-sgvu-gold" />
          <span className="max-w-[140px] truncate whitespace-nowrap">
            {active?.entity_name ?? 'Select Entity'}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Your organizations</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {entities.map((entity) => (
          <DropdownMenuItem
            key={entity.entity_id}
            onClick={() => setEntityId(entity.entity_id)}
            className={`cursor-pointer ${entity.entity_id === entityId ? 'bg-muted font-semibold' : ''}`}
          >
            {entity.entity_name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
