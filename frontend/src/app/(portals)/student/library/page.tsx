import { ComingSoonWorkspace } from '@/components/shared/ComingSoonWorkspace';
import { LibraryOpacPanel } from '@/components/library/LibraryOpacPanel';
import { isStudentLibraryLaunched } from '@/lib/student-library-launch';

export default function StudentLibraryPage() {
  if (isStudentLibraryLaunched()) {
    return (
      <LibraryOpacPanel
        title="Student Library Services"
        description="Search the catalog, manage loans, renew books and open digital resources."
      />
    );
  }

  return (
    <ComingSoonWorkspace
      title="Student Library Services"
      description="Catalog search, renewals, holds and digital-library access are being integrated. These services are not operational in Falcon yet."
      backHref="/student/dashboard"
    />
  );
}
