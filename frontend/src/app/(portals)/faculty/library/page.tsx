'use client';

import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { LibraryOpacPanel } from '@/components/library/LibraryOpacPanel';

export default function FacultyLibraryPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Library OPAC"
        description="Search the university catalog, place holds, and manage your faculty loans."
      />
      <LibraryOpacPanel
        basePath="/faculty/library"
        title="Faculty library"
        description="Extended loan period (semester) and higher book quota — enforced at the circulation desk."
      />
    </div>
  );
}
