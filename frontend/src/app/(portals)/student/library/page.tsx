import { ComingSoonWorkspace } from '@/components/shared/ComingSoonWorkspace';

export default function StudentLibraryPage() {
  return (
    <ComingSoonWorkspace
      title="Student Library Services"
      description="Catalog search, renewals, holds and digital-library access are being integrated. These services are not operational in Falcon yet."
      backHref="/student/dashboard"
    />
  );
}
