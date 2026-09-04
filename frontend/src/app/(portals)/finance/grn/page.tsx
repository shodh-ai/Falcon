"use client";

import { ProcurementWorkspace } from "@/components/procurements/ProcurementWorkspace";
import { Card, CardContent } from "@/components/ui/card";

export default function Page() {
  return (
    <div className="space-y-4">
      <Card className="mx-6 mt-6 border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 text-sm">
          <strong>Central Stores receiving</strong>
          <p className="mt-1 text-muted-foreground">
            Select the exact approved procurement requirement below. Its receipt
            workspace asks for the issued order, quantity, and a geo-tagged
            image of the unopened package with the shipping label and relevant
            delivery information visible. Do not open the package at this stage.
          </p>
        </CardContent>
      </Card>
      <ProcurementWorkspace />
    </div>
  );
}
