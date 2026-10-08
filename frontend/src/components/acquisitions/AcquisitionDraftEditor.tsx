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
      quantity: Number(line.quantity),
      acquisition_layout: line.acquisition_layout as
        | "ONLINE"
        | "OFFLINE"
        | "GENERAL",
      product_url: line.product_url ?? "",
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
            <span className="font-medium">Required by date</span>
            <Input
              aria-label="Required by date"
              aria-describedby="draft-required-date-help"
              type="date"
              value={draft.required_by_date}
              onChange={(event) =>
                setDraft({ ...draft, required_by_date: event.target.value })
              }
            />
            <span
              id="draft-required-date-help"
              className="block text-xs text-muted-foreground"
            >
              Date the goods or service must be available. This is not the
              current date, fund-release date, or fund-utilization date.
            </span>
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
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Acquisition layout</span>
                <select
                  aria-label={`Line ${index + 1} acquisition layout`}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={line.acquisition_layout}
                  onChange={(event) =>
                    setLine(index, {
                      acquisition_layout: event.target.value as
                        | "ONLINE"
                        | "OFFLINE"
                        | "GENERAL",
                    })
                  }
                >
                  <option value="GENERAL">General</option>
                  <option value="ONLINE">Online</option>
                  <option value="OFFLINE">Offline</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span>Quantity</span>
                <Input
                  aria-label={`Line ${index + 1} quantity`}
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={line.quantity}
                  onKeyDown={(event) => {
                    if ([".", "e", "E", "+", "-"].includes(event.key))
                      event.preventDefault();
                  }}
                  onChange={(event) => {
                    const quantity = Number(event.target.value);
                    if (Number.isInteger(quantity) && quantity >= 0)
                      setLine(index, { quantity });
                  }}
                />
                <span className="block text-xs text-muted-foreground">
                  Enter 0 to verify that validation blocks a non-positive
                  quantity. Valid submissions require a whole number above 0.
                </span>
              </label>
            </div>
            {line.acquisition_layout === "ONLINE" && (
              <label className="space-y-1 text-sm">
                <span>Product URL</span>
                <Input
                  aria-label={`Line ${index + 1} product URL`}
                  type="text"
                  inputMode="url"
                  placeholder="https://vendor.example/product"
                  value={line.product_url ?? ""}
                  onChange={(event) =>
                    setLine(index, { product_url: event.target.value })
                  }
                />
                <span className="block text-xs text-muted-foreground">
                  Validation requires a complete HTTPS URL and reports the
                  error without opening the address.
                </span>
              </label>
            )}
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
