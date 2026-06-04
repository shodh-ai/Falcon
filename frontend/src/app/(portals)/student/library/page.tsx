'use client';

import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { LibraryOpacPanel } from '@/components/library/LibraryOpacPanel';

export default function StudentLibraryOpacPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <StudentPageHeader
        title="Library OPAC"
        description="Search the Falcon catalog, manage loans, place holds, and access e-resources."
      />
      <LibraryOpacPanel
        basePath="/student/library"
        title="Catalog search"
        description="Blazing-fast OPAC with live availability — replaces legacy Koha OPAC."
      />
    </div>
  );
}
