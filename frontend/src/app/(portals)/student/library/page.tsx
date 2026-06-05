'use client';

import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { LibraryOpacPanel } from '@/components/library/LibraryOpacPanel';

export default function StudentLibraryOpacPage() {
  return (
    <StudentPageShell width="6xl">
      <StudentPageHeader
        title="Library & Dues"
        description="Search the Falcon catalog, manage loans, place holds, and access e-resources."
      />
      <div className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-white shadow-sm">
        <LibraryOpacPanel
          basePath="/student/library"
          title="Catalog search"
          description="Blazing-fast OPAC with live availability — replaces legacy Koha OPAC."
          embedded
        />
      </div>
    </StudentPageShell>
  );
}
