"use client";

import { useEffect, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

type Preview = { url: string; image: boolean };

// Mount with a key containing the user and document type. A different document
// must never display the previous person's file, even during a slow response.
export function StaffDocumentPreview({ userId, docType, title }: {
  userId: string;
  docType: string;
  title: string;
}) {
  const api = useAuthedApi();
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
      setError("The document request timed out. Check your connection and retry.");
    }, 30_000);
    void api.getBlob(
      `/api/staff/verifications/${userId}/documents/${docType}/preview`,
      { signal: controller.signal },
    ).then((blob) => {
      if (controller.signal.aborted) return;
      if (!blob.size) throw new Error("The stored document is empty. Ask for a replacement upload.");
      if (!blob.type.startsWith("image/") && blob.type !== "application/pdf") {
        throw new Error("This file cannot be previewed. Ask for a PDF or image replacement.");
      }
      objectUrl = URL.createObjectURL(blob);
      setPreview({ url: objectUrl, image: blob.type.startsWith("image/") });
    }).catch((cause) => {
      if (controller.signal.aborted && !timedOut) return;
      setError(timedOut
        ? "The document request timed out. Check your connection and retry."
        : cause instanceof Error ? cause.message : "Could not load this document. Please retry.");
    }).finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, userId, docType, attempt]);

  useEffect(() => {
    if (!preview || !rendering || error) return;
    const timeout = window.setTimeout(() => setError(
      "The document could not be displayed in time. Retry or request a replacement upload.",
    ), 20_000);
    return () => window.clearTimeout(timeout);
  }, [preview, rendering, error]);

  const retry = () => {
    setError("");
    setPreview(null);
    setRendering(true);
    setAttempt((value) => value + 1);
  };
  const renderError = () => {
    setRendering(false);
    setError("The file was downloaded but could not be displayed. Retry or request a replacement upload.");
  };

  return (
    <div aria-busy={!error && (!preview || rendering)}>
      {error ? (
        <div className="space-y-3 p-4">
          <p role="alert" className="text-sm text-red-700">{error}</p>
          <p className="text-sm text-muted-foreground">
            Do not mark a document verified if you cannot inspect it. Details-only profile approval can proceed separately. If the original file is missing,
            restore it from an uploads backup or select this document for replacement and request corrections below.
          </p>
          <Button variant="outline" size="sm" onClick={retry}>Retry document</Button>
        </div>
      ) : (
        <>
          {(!preview || rendering) && (
            <p role="status" className="p-6 text-sm text-muted-foreground">Loading {title}…</p>
          )}
          {preview && (preview.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={title}
              onLoad={() => setRendering(false)} onError={renderError}
              className="max-h-[520px] w-full object-contain" />
          ) : (
            <>
              <iframe title="Submitted document preview" src={preview.url}
                onLoad={() => setRendering(false)} onError={renderError}
                className="h-[520px] w-full rounded border bg-white" />
              <a href={preview.url} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-sm underline">Open PDF in a separate tab</a>
            </>
          ))}
        </>
      )}
    </div>
  );
}
