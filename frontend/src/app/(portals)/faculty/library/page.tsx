'use client';

import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';
import { LibraryOpacPanel } from '@/components/library/LibraryOpacPanel';

export default function FacultyLibraryPage() {
  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Library OPAC"
        description="Search the university catalog, place holds, and manage faculty loans."
      />
      <LibraryOpacPanel
        basePath="/faculty/library"
        title="Faculty library"
        description="Extended loan period (semester) and higher book quota — enforced at the circulation desk."
        embedded
      />
    </FacultyPageShell>
  );
}
