import { InvoiceIntegrityCaseWorkspace } from "@/components/invoice-integrity/InvoiceIntegrityCaseWorkspace";

export default async function InvoiceIntegrityCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <InvoiceIntegrityCaseWorkspace caseId={caseId} />;
}
