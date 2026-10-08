import { ProductVerificationCaseWorkspace } from "@/components/product-verification/ProductVerificationCaseWorkspace";

export default async function ProductVerificationCasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return <ProductVerificationCaseWorkspace caseId={caseId} />;
}
