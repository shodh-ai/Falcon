import { ComingSoonWorkspace } from '@/components/shared/ComingSoonWorkspace';

export default function Page() {
  return (
    <ComingSoonWorkspace
      title="Student Library Services"
      description="Catalog search, renewals, holds and digital-library access are not operational yet."
      backHref="/student/dashboard"
    />
  );
}
