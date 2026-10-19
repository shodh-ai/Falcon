import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaffDocumentPreview } from "../StaffDocumentPreview";

const api = vi.hoisted(() => ({ getBlob: vi.fn() }));
vi.mock("@/lib/api", () => ({ useAuthedApi: () => api }));
const props = { userId: "staff-1", docType: "PHOTO", title: "Passport photograph" };
const photo = () => new Blob(["test"], { type: "image/jpeg" });

describe("Authenticated staff document preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:test-document"),
      revokeObjectURL: vi.fn(),
    }));
    api.getBlob.mockResolvedValue(photo());
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("shows loading until the image actually loads, with authenticated and scoped retrieval", async () => {
    render(<StaffDocumentPreview {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading Passport photograph");
    const image = await screen.findByRole("img");
    expect(api.getBlob).toHaveBeenCalledWith(
      "/api/staff/verifications/staff-1/documents/PHOTO/preview", { signal: expect.any(AbortSignal) },
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    fireEvent.load(image);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("retains the server's missing-file explanation and retries the same document successfully", async () => {
    api.getBlob.mockRejectedValueOnce(new Error("The document record exists, but its original file is missing from storage."));
    render(<StaffDocumentPreview {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("original file is missing");
    expect(screen.getByText(/Do not mark a document verified if you cannot inspect it/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry document" }));
    fireEvent.load(await screen.findByRole("img"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getBlob).toHaveBeenCalledTimes(2);
  });

  it("reports a corrupt image rather than treating the HTTP download as preview success", async () => {
    render(<StaffDocumentPreview {...props} />);
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be displayed");
  });

  it.each([
    [new Blob([], { type: "image/jpeg" }), "empty"],
    [new Blob(["<html>sign in</html>"], { type: "text/html" }), "cannot be previewed"],
  ])("rejects an empty or non-document response", async (blob, message) => {
    api.getBlob.mockResolvedValue(blob);
    render(<StaffDocumentPreview {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("supports PDF previews with a separate-tab fallback", async () => {
    api.getBlob.mockResolvedValue(new Blob(["%PDF-test"], { type: "application/pdf" }));
    render(<StaffDocumentPreview {...props} docType="AADHAAR" title="Aadhaar card" />);
    const frame = await screen.findByTitle("Submitted document preview");
    fireEvent.load(frame);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open PDF/ })).toHaveAttribute("href", "blob:test-document");
  });

  it("aborts obsolete requests and never displays a late response from another person", async () => {
    let finish!: (blob: Blob) => void;
    api.getBlob.mockReturnValueOnce(new Promise<Blob>((resolve) => { finish = resolve; }));
    const view = render(<StaffDocumentPreview key="staff-1:PHOTO" {...props} />);
    const signal = api.getBlob.mock.calls[0][1].signal as AbortSignal;
    view.rerender(<StaffDocumentPreview key="staff-2:PHOTO" {...props} userId="staff-2" />);
    await screen.findByRole("img");
    await act(async () => finish(photo()));
    expect(signal.aborted).toBe(true);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test-document");
  });

  it("stops an unresponsive download after 30 seconds and offers retry", async () => {
    vi.useFakeTimers();
    api.getBlob.mockReturnValue(new Promise(() => {}));
    render(<StaffDocumentPreview {...props} />);
    await act(async () => vi.advanceTimersByTime(30_000));
    expect(screen.getByRole("alert")).toHaveTextContent("timed out");
    expect(api.getBlob.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("does not spin forever when the browser never finishes rendering", async () => {
    render(<StaffDocumentPreview {...props} />);
    await screen.findByRole("img");
    vi.useFakeTimers();
    // A fresh retry starts both the request and render timers under the fake clock.
    fireEvent.error(screen.getByRole("img"));
    fireEvent.click(screen.getByRole("button", { name: "Retry document" }));
    await act(async () => {});
    await act(async () => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole("alert")).toHaveTextContent("could not be displayed in time");
  });
});
