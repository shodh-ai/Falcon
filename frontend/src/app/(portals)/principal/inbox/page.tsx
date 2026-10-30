"use client";
import { DepartmentCasesPanel } from "@/components/principal/DepartmentCasesPanel";
import { PrincipalReportingRequests } from "@/components/principal/PrincipalReportingRequests";
import { PrincipalGatePasses } from "@/components/principal/PrincipalGatePasses";
import { PrincipalDepartmentPicker, usePrincipalDepartments } from "@/components/principal/PrincipalDepartmentPicker";
import { HrAppealsPanel } from "@/components/self-service/HrAppealsPanel";
import { DepartmentHrApprovalsPanel } from "@/components/self-service/DepartmentHrApprovalsPanel";
export default function PrincipalInbox() {
  const { departments, selected, choose } = usePrincipalDepartments();
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Approval Centre</h1>
      <PrincipalDepartmentPicker departments={departments} selected={selected} choose={choose} />
      <HrAppealsPanel />
      <DepartmentHrApprovalsPanel />
      {selected && <DepartmentCasesPanel departmentId={selected} />}
      <section className="border-t pt-6">
        <h2 className="text-lg font-bold">
          Previously assigned reporting requests
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Existing requests retain their recorded approvers. New routine
          department requests are routed to HOD.
        </p>
        <PrincipalReportingRequests />
        <PrincipalGatePasses />
      </section>
    </main>
  );
}
