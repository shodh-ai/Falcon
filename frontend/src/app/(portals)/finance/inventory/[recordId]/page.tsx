import { InventoryDetailWorkspace } from "@/components/inventory/InventoryDetailWorkspace";
export default async function InventoryDetailPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  return <InventoryDetailWorkspace recordId={recordId} />;
}
