import { ProcurementCaseWorkspace } from "@/components/procurements/ProcurementCaseWorkspace";
export default async function ProcurementCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <ProcurementCaseWorkspace caseId={caseId} />;
}
