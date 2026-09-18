"use client";

import { useState } from "react";
import type {
  AcquisitionDetail,
  AcquisitionDraftCorrectionInput,
} from "@/lib/api/api.acquisitions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  detail: AcquisitionDetail;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: AcquisitionDraftCorrectionInput) => Promise<void>;
};

const specificationText = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value ?? {});

export function AcquisitionDraftEditor({
  detail,
  busy,
  onCancel,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<AcquisitionDraftCorrectionInput>({
    required_by_date: detail.required_by_date
      ? String(detail.required_by_date).slice(0, 10)
      : "",
    intended_use_case: detail.intended_use_case,
    lines: detail.lines.map((line) => ({
      line_id: line.line_id,
      intended_use: line.intended_use ?? "",
      technical_specifications: specificationText(
        line.technical_specifications,
      ),
    })),
  });

  const setLine = (
    index: number,
    patch: Partial<AcquisitionDraftCorrectionInput["lines"][number]>,
  ) =>
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    }));

  return (
    <Card className="border-amber-300">
      <CardHeader>
        <CardTitle className="text-base">Edit draft</CardTitle>
        <p className="text-sm text-muted-foreground">
          Correct the request before validation. Submitted versions remain
          immutable.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Required-by date</span>
            <Input
              aria-label="Required-by date"
              type="date"
              value={draft.required_by_date}
              onChange={(event) =>
                setDraft({ ...draft, required_by_date: event.target.value })
              }
            />
          </label>
          <label className="space-y-1 text-sm md:col-span-2">
            <span className="font-medium">Overall intended use</span>
            <Input
              aria-label="Overall intended use"
              value={draft.intended_use_case}
              onChange={(event) =>
                setDraft({ ...draft, intended_use_case: event.target.value })
              }
            />
          </label>
        </div>
        {draft.lines.map((line, index) => (
          <div key={line.line_id} className="grid gap-3 rounded-lg border p-3">
            <strong>
              Line {index + 1}: {detail.lines[index]?.product_name}
            </strong>
            <label className="space-y-1 text-sm">
              <span>Notes and General info (optional)</span>
              <Textarea
                aria-label={`Line ${index + 1} notes and general info`}
                value={line.technical_specifications || line.intended_use}
                onChange={(event) =>
                  setLine(index, {
                    intended_use: event.target.value,
                    technical_specifications: event.target.value,
                  })
                }
              />
            </label>
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void onSave(draft)}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
