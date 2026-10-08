'use client';

import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { HEADER_CONTROL_CLASS } from '@/components/layout/header-styles';
import { cn } from '@/lib/utils';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';

export function TeachingDepartmentSwitcher() {
  const {
    loading,
    isMultiDepartment,
    departments,
    activeDeptId,
    activeDepartment,
    setActiveDeptId,
  } = useTeachingDepartment();

  if (loading || !isMultiDepartment || departments.length < 2) return null;

  const label = activeDepartment?.dept_name ?? 'Department';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn('h-10 shrink-0 gap-2 inline-flex max-w-[12rem]', HEADER_CONTROL_CLASS)}
          title={`Teaching department: ${label}`}
        >
          <Building2 className="h-4 w-4 shrink-0 text-sgvu-gold" />
          <span className="truncate whitespace-nowrap">{label}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Teaching department</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {departments.map((dept) => {
          const active = dept.dept_id === activeDeptId;
          return (
            <DropdownMenuItem
              key={dept.dept_id}
              onClick={() => setActiveDeptId(dept.dept_id)}
              className="cursor-pointer"
            >
              <Building2 className="mr-2 h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{dept.dept_name}</span>
              <Badge variant="secondary" className="ml-2 shrink-0">
                {dept.course_count}
              </Badge>
              {active && <Check className="ml-2 h-4 w-4 shrink-0 text-sgvu-gold" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
