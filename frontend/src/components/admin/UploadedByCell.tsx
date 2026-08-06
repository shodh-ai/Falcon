'use client';

import { HrAvatar } from '@/components/hr/HrAvatar';
import type { UploaderInfo } from '@/components/admin/upload-history-utils';
import { abbreviateDepartment } from '@/components/admin/upload-history-utils';
import { cn } from '@/lib/utils';

export function UploadedByCell({
  uploader,
  className,
}: {
  uploader: UploaderInfo;
  className?: string;
}) {
  const isUnknown = uploader.name === 'Unknown User';

  return (
    <div className={cn('group relative min-w-[140px]', className)}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <HrAvatar name={uploader.name} size="sm" className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-sgvu-navy">{uploader.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
            {abbreviateDepartment(uploader.department, 22)}
          </p>
          <p className="mt-0.5 hidden truncate text-xs text-muted-foreground md:block lg:hidden">
            {abbreviateDepartment(uploader.department, 28)}
          </p>
          <p className="mt-0.5 hidden truncate text-xs text-muted-foreground lg:block">
            {uploader.department}
          </p>
        </div>
      </div>

      {!isUnknown ? (
        <div
          className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-60 rounded-xl border border-sgvu-navy/10 bg-white p-3 text-left shadow-lg group-hover:block group-focus-within:block"
          role="tooltip"
        >
          <dl className="space-y-1.5 text-xs">
            <div>
              <dt className="font-semibold text-sgvu-navy/70">Name</dt>
              <dd className="text-sgvu-navy">{uploader.name}</dd>
            </div>
            <div>
              <dt className="font-semibold text-sgvu-navy/70">Role</dt>
              <dd className="text-sgvu-navy">{uploader.role}</dd>
            </div>
            <div>
              <dt className="font-semibold text-sgvu-navy/70">Department</dt>
              <dd className="text-sgvu-navy">{uploader.department}</dd>
            </div>
            {uploader.employeeId ? (
              <div>
                <dt className="font-semibold text-sgvu-navy/70">Employee ID</dt>
                <dd className="font-mono text-sgvu-navy">{uploader.employeeId}</dd>
              </div>
            ) : null}
            {uploader.email ? (
              <div>
                <dt className="font-semibold text-sgvu-navy/70">Email</dt>
                <dd className="break-all text-sgvu-navy">{uploader.email}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
