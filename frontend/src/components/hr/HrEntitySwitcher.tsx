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

  if (loading || entities.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="hidden h-10 shrink-0 gap-2 md:inline-flex" title="Select Entity">
          <Building2 className="h-4 w-4 shrink-0 text-sgvu-gold" />
          <span className="max-w-[140px] truncate whitespace-nowrap">
            {active?.entity_name ?? 'Select Entity'}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Select Entity</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {entities.map((entity) => (
          <DropdownMenuItem
            key={entity.entity_id}
            onClick={() => setEntityId(entity.entity_id)}
            className="cursor-pointer"
          >
            {entity.entity_name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
