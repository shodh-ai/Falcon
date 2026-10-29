import { DepartmentCasesPanel } from "@/components/principal/DepartmentCasesPanel";
import { TeamInboxPage } from "@/components/self-service/TeamInboxPage";
import { PrincipalGatePasses } from "@/components/principal/PrincipalGatePasses";
export default function PrincipalInbox() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Approval Centre</h1>
      <DepartmentCasesPanel />
      <section className="border-t pt-6">
        <h2 className="text-lg font-bold">
          Previously assigned reporting requests
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Existing requests retain their recorded approvers. New routine
          department requests are routed to HOD.
        </p>
        <TeamInboxPage />
        <PrincipalGatePasses />
      </section>
    </main>
  );
}
