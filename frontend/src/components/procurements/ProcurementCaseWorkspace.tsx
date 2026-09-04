"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthedApi } from "@/lib/api";
import {
  createProcurementsApi,
  type ProcurementCaseDetail,
} from "@/lib/api/api.procurements";
import { toast } from "@/lib/notifications/falcon-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

const money = (value: unknown, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(
    Number(value ?? 0),
  );
const value = (row: Record<string, unknown>, key: string) =>
  String(row[key] ?? "");

export function ProcurementCaseWorkspace({ caseId }: { caseId: string }) {
  const { user } = useAuth();
  const authed = useAuthedApi();
  const api = useMemo(() => createProcurementsApi(authed), [authed]);
  const [detail, setDetail] = useState<ProcurementCaseDetail | null>(null);
  const normalizedRole = String(user?.primaryRole ?? user?.role ?? "").toLowerCase();
  const [tab, setTab] = useState(() => normalizedRole === "receivingclerk" || normalizedRole === "stores" ? "receipts" : normalizedRole === "apclerk" ? "invoices" : "orders");
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [vendors, setVendors] = useState<Array<{vendor_id:string;business_name:string;gstin?:string}>>([]);
  const [order, setOrder] = useState({
    proc_case_line_id: "",
    vendor_id: "",
    quantity: 1,
    unit_price: 0,
    expected_delivery_date: "",
    discrepancy_justification: "",
    add_unplanned: false,
    product_name: "",
    category: "",
    unit: "unit",
    fulfillment_type: "ASSET",
  });
  const [receipt, setReceipt] = useState({ order_id: "", order_line_id: "", received_quantity: 0, evidence_upload_id: "", latitude: 0, longitude: 0, accuracy: 0 });
  const [invoice, setInvoice] = useState({ order_id: "", order_line_id: "", invoice_number: "QA-INV-2026-0001", invoice_date: new Date().toISOString().slice(0,10), quantity: 1, unit_price: 0, document_upload_id: "" });
  const [productEvidenceReceiptLine, setProductEvidenceReceiptLine] = useState("");
  const [productEvidenceUploadId, setProductEvidenceUploadId] = useState("");
  const reload = useCallback(
    () =>
      api
        .get(caseId)
        .then((data) => {
          setDetail(data);
          const first = data.lines[0] as Record<string, unknown> | undefined;
          if (first)
            setOrder((current) => ({
              ...current,
              proc_case_line_id:
                current.proc_case_line_id || value(first, "proc_case_line_id"),
              vendor_id:
                current.vendor_id || value(first, "approved_vendor_id"),
              unit_price:
                current.unit_price || Number(first.approved_unit_price ?? 0),
            }));
        })
        .catch((error) => toast.error(error.message)),
    [api, caseId],
  );
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (normalizedRole === "receivingclerk" || normalizedRole === "stores") setTab("receipts");
    else if (normalizedRole === "apclerk") setTab("invoices");
  }, [normalizedRole]);
  useEffect(() => {
    if (["procurementbuyer","procurement","procurementhead"].includes(normalizedRole))
      void api.vendors().then(setVendors).catch((error)=>toast.error(error.message));
  }, [api, normalizedRole]);
  async function action(operation: () => Promise<unknown>, message: string) {
    setBusy(true);
    try {
      await operation();
      toast.success(message);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }
  async function previewWorkbook(file?: File) {
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    await action(async () => {
      const preview = await api.previewWorkbook(caseId, form);
      setImportPreview(preview);
      return preview;
    }, "Workbook changes validated");
  }
  async function download(blobPromise: Promise<Blob>, filename: string) {
    try {
      const blob = await blobPromise;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }
  async function uploadInvoice(file?: File) {
    if (!file) return;
    const form = new FormData(); form.set("file", file);
    await action(async () => {
      const result = await api.uploadInvoiceDocument(caseId, form);
      setInvoice((current) => ({ ...current, document_upload_id: result.document_upload_id }));
      return result;
    }, "Invoice document uploaded and scanned");
  }
  async function uploadGeoEvidence(file: File, purpose: "PACKAGE_RECEIPT" | "RECEIVED_PRODUCT", receiptLineId?: string) {
    if (!navigator.geolocation) throw new Error("Location is required for receipt evidence");
    const position = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000 }),
    );
    const form = new FormData();
    form.set("file", file); form.set("purpose", purpose);
    form.set("latitude", String(position.coords.latitude));
    form.set("longitude", String(position.coords.longitude));
    form.set("accuracy_metres", String(position.coords.accuracy));
    form.set("captured_at", new Date(position.timestamp).toISOString());
    if (receiptLineId) form.set("receipt_line_id", receiptLineId);
    const result = await api.uploadReceiptEvidence(caseId, form);
    if (purpose === "PACKAGE_RECEIPT") setReceipt((current) => ({ ...current, evidence_upload_id: result.document_upload_id, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }));
    else setProductEvidenceUploadId(result.document_upload_id);
    toast.success(purpose === "PACKAGE_RECEIPT" ? "Geo-tagged package evidence ready" : "Geo-tagged received-product evidence saved");
  }
  if (!detail)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Loading progressive procurement case…
      </div>
    );
  const revision = Number(detail.aggregate_revision);
  const key = (prefix: string) => `${prefix}:${caseId}:${revision}`;
  const tabs = [
    "orders",
    "receipts",
    "invoices",
    "funds",
    "returns",
    "inventory",
    "audit",
  ];
  const receivableOrders = detail.orders.filter((item) => ["ISSUED","PARTIALLY_RECEIVED"].includes(value(item,"status")));
  const receiptOrderLines = detail.order_lines.filter((item) => value(item,"order_id") === receipt.order_id);
  const invoiceOrders = detail.orders.filter((item) => ["ISSUED","PARTIALLY_RECEIVED","RECEIVED","CLOSED"].includes(value(item,"status")));
  const invoiceOrderLines = detail.order_lines.filter((item) => value(item,"order_id") === invoice.order_id);
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">{detail.acquisition_number}</h1>
          <p className="text-sm text-muted-foreground">
            Procurement case {caseId} · revision {revision} · {detail.status}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void download(api.workbook(caseId), `${detail.acquisition_number}-procurement.xlsx`)}>Export Excel</Button>
          <label className="inline-flex h-10 cursor-pointer items-center rounded-md border px-4 text-sm font-medium">
            Upload Excel and preview changes
            <input
              className="hidden"
              type="file"
              accept=".xlsx"
              onChange={(event) =>
                void previewWorkbook(event.target.files?.[0])
              }
            />
          </label>
        </div>
      </div>
      {importPreview && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <strong>
                {String(importPreview.changed_rows ?? 0)} workbook rows
                validated
              </strong>
              <p className="text-muted-foreground">
                Revision {String(importPreview.base_revision ?? revision)} ·
                explicit atomic commit required
              </p>
            </div>
            <Button
              disabled={busy}
              onClick={() =>
                void action(
                  () =>
                    api.commitWorkbook(
                      caseId,
                      String(importPreview.import_preview_id),
                    ),
                  "Workbook changes committed atomically",
                ).then(() => setImportPreview(null))
              }
            >
              Commit workbook
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Allocated", detail.approved_allocation],
          ["Available", detail.available_amount],
          ["Committed", detail.committed_amount],
          ["Expended", detail.expended_amount],
          ["Released", detail.released_amount],
        ].map(([label, amount]) => (
          <Card key={String(label)}>
            <CardContent className="p-4">
              <p className="text-xs uppercase text-muted-foreground">{label}</p>
              <strong>{money(amount, detail.currency)}</strong>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((name) => (
          <Button
            key={name}
            size="sm"
            variant={tab === name ? "default" : "outline"}
            onClick={() => setTab(name)}
          >
            {name.toUpperCase()}
          </Button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Record an order or market-driven change
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">Vendor, specification, quantity and price changes are allowed within the controlled budget workflow. Every difference is permanently logged and requires justification.</p>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={order.add_unplanned} onChange={(e) => setOrder({...order,add_unplanned:e.target.checked})}/> Add a product not in the original request</label>
              {!order.add_unplanned ? <>
              <select
                className="h-10 w-full rounded-md border px-3 text-sm"
                value={order.proc_case_line_id}
                onChange={(e) => {
                  const line = detail.lines.find(
                    (item) =>
                      value(item, "proc_case_line_id") === e.target.value,
                  ) as Record<string, unknown> | undefined;
                  setOrder({
                    ...order,
                    proc_case_line_id: e.target.value,
                    vendor_id: value(line ?? {}, "approved_vendor_id"),
                    unit_price: Number(line?.approved_unit_price ?? 0),
                  });
                }}
              >
                {detail.lines.map((line) => (
                  <option
                    key={value(line, "proc_case_line_id")}
                    value={value(line, "proc_case_line_id")}
                  >
                    {value(line, "product_name")} ·{" "}
                    {value(line, "approved_quantity")} {value(line, "unit")}
                  </option>
                ))}
              </select>
              </> : <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
                <Input placeholder="New product name" value={order.product_name} onChange={(e)=>setOrder({...order,product_name:e.target.value})}/>
                <Input placeholder="Category" value={order.category} onChange={(e)=>setOrder({...order,category:e.target.value})}/>
                <Input placeholder="Unit (for example: unit, box)" value={order.unit} onChange={(e)=>setOrder({...order,unit:e.target.value})}/>
                <select className="h-10 w-full rounded-md border px-3" value={order.fulfillment_type} onChange={(e)=>setOrder({...order,fulfillment_type:e.target.value})}><option>ASSET</option><option>CONSUMABLE</option><option>SERVICE</option><option>INSTALLATION</option></select>
              </div>}
              <select aria-label="Order vendor" className="h-10 w-full rounded-md border px-3" value={order.vendor_id} onChange={(e)=>setOrder({...order,vendor_id:e.target.value})}><option value="">Select vendor</option>{vendors.map((vendor)=><option key={vendor.vendor_id} value={vendor.vendor_id}>{vendor.business_name}{vendor.gstin ? ` · ${vendor.gstin}` : ""}</option>)}</select>
              <Input
                type="number"
                min="0.001"
                step="0.001"
                value={order.quantity}
                onChange={(e) =>
                  setOrder({ ...order, quantity: Number(e.target.value) })
                }
              />
              <Input placeholder="Required justification for any vendor/product/quantity/price change" value={order.discrepancy_justification} onChange={(e)=>setOrder({...order,discrepancy_justification:e.target.value})}/>
              <p className="text-xs text-muted-foreground">Up to 10% over the approved envelope may be recorded as a controlled exception, but Finance approval is required before the order can be issued. Larger overruns require a Module 1 amendment.</p>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={order.unit_price}
                onChange={(e) =>
                  setOrder({ ...order, unit_price: Number(e.target.value) })
                }
              />
              <Input
                type="date"
                value={order.expected_delivery_date}
                onChange={(e) =>
                  setOrder({ ...order, expected_delivery_date: e.target.value })
                }
              />
              <Button
                disabled={busy}
                onClick={() =>
                  void action(
                    () =>
                      api.createOrder(caseId, revision, {
                        vendor_id: order.vendor_id,
                        discrepancy_justification: order.discrepancy_justification || undefined,
                        expected_delivery_date:
                          order.expected_delivery_date || undefined,
                        lines: [
                          {
                            proc_case_line_id: order.add_unplanned ? undefined : order.proc_case_line_id,
                            product_name: order.add_unplanned ? order.product_name : undefined,
                            category: order.add_unplanned ? order.category : undefined,
                            unit: order.add_unplanned ? order.unit : undefined,
                            fulfillment_type: order.add_unplanned ? order.fulfillment_type : undefined,
                            quantity: order.quantity,
                            unit_price: order.unit_price,
                            discrepancy_justification: order.discrepancy_justification || undefined,
                          },
                        ],
                      }),
                    "Order draft created",
                  )
                }
              >
                Save order draft
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Orders and line allocations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.orders.map((item) => {
                const id = value(item, "order_id");
                return (
                  <div key={id} className="rounded border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong>{value(item, "order_number")}</strong>
                        <p className="text-sm text-muted-foreground">
                          {value(item, "status")} ·{" "}
                          {money(item.total_amount, detail.currency)}
                        </p>
                        {Boolean(item.has_discrepancy) && <p className="text-xs font-medium text-amber-700">Logged deviation · {value(item,"exception_status").replaceAll("_"," ")}</p>}
                      </div>
                      {value(item, "status") === "DRAFT" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            void action(
                              () =>
                                api.issueOrder(
                                  caseId,
                                  id,
                                  revision,
                                  key(`issue:${id}`),
                                ),
                              "Order issued and funds committed",
                            )
                          }
                        >
                          Issue order
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      {detail.order_lines
                        .filter((line) => value(line, "order_id") === id)
                        .map((line) => (
                          <span
                            className="mr-3"
                            key={value(line, "order_line_id")}
                          >
                            {value(line, "quantity")} ×{" "}
                            {money(line.unit_price, detail.currency)}
                          </span>
                        ))}
                    </div>
                  </div>
                );
              })}
              {!detail.orders.length && (
                <p className="py-8 text-center text-muted-foreground">
                  No orders yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "receipts" && (
        <div className="grid gap-4 lg:grid-cols-[380px_1fr]"><Card>
          <CardHeader>
            <CardTitle>Receive sealed package</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              P12: photograph the unopened package with the shipping label and relevant delivery information clearly visible. Location is captured with the image. Do not open the package at this stage.
            </p>
            <select className="h-10 w-full rounded-md border px-3" value={receipt.order_id} onChange={(e)=>setReceipt({...receipt,order_id:e.target.value,order_line_id:""})}><option value="">Select issued order</option>{receivableOrders.map((item)=><option key={value(item,"order_id")} value={value(item,"order_id")}>{value(item,"order_number")}</option>)}</select>
            <select className="h-10 w-full rounded-md border px-3" value={receipt.order_line_id} onChange={(e)=>{const line=receiptOrderLines.find((item)=>value(item,"order_line_id")===e.target.value);setReceipt({...receipt,order_line_id:e.target.value,received_quantity:Number(line?.quantity ?? 0) - Number(line?.cancelled_quantity ?? 0)})}}><option value="">Select order line</option>{receiptOrderLines.map((item)=><option key={value(item,"order_line_id")} value={value(item,"order_line_id")}>{value(item,"product_name") || "Order item"} · {value(item,"quantity")} {value(item,"unit")}</option>)}</select>
            {receipt.order_line_id && <p className="rounded bg-slate-50 p-2 text-sm">Package quantity from issued order: <strong>{receipt.received_quantity}</strong>. Stores does not inspect or accept the product at this stage.</p>}
            <label className="block rounded-md border border-dashed p-3 text-sm font-medium">Capture package + shipping label image<input className="mt-2 block w-full" type="file" accept="image/*" capture="environment" onChange={(e)=>{const file=e.target.files?.[0]; if(file) void uploadGeoEvidence(file,"PACKAGE_RECEIPT").catch((error)=>toast.error(error.message))}}/></label>
            {receipt.evidence_upload_id && <p className="text-xs text-emerald-700">Geo evidence ready · accuracy {Math.round(receipt.accuracy)} m</p>}
            <Button disabled={busy || !receipt.order_id || !receipt.order_line_id || !receipt.evidence_upload_id} onClick={()=>void action(()=>api.recordReceipt(caseId,receipt.order_id,revision,{actual_delivery_date:new Date().toISOString().slice(0,10),package_evidence_upload_id:receipt.evidence_upload_id,capture_latitude:receipt.latitude,capture_longitude:receipt.longitude,capture_accuracy_metres:receipt.accuracy,evidence_captured_at:new Date().toISOString(),lines:[{order_line_id:receipt.order_line_id,received_quantity:receipt.received_quantity,accepted_quantity:0,rejected_quantity:0}]}),"Sealed package received; requester confirmation is pending")}>Mark sealed package received</Button>
          </CardContent>
        </Card><Card><CardHeader><CardTitle>Receipt history and requester product evidence</CardTitle></CardHeader><CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">After opening, the original requester may add geo-tagged images of the exact products here. These images supplement—not replace—the Stores package receipt.</p>
            <select aria-label="Receipt line for product evidence" className="h-10 w-full rounded-md border px-3 text-sm" value={productEvidenceReceiptLine} onChange={(e)=>setProductEvidenceReceiptLine(e.target.value)}><option value="">Select the received item</option>{detail.receipt_lines.map((line)=><option key={value(line,"receipt_line_id")} value={value(line,"receipt_line_id")}>{value(line,"receipt_number") || "Receipt"} · {value(line,"product_name") || "Received item"} · {value(line,"received_quantity")}</option>)}</select>
            <label className={`inline-flex rounded-md border px-3 py-2 text-sm font-medium ${productEvidenceReceiptLine ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>Capture exact received-product image<input disabled={!productEvidenceReceiptLine} className="hidden" type="file" accept="image/*" capture="environment" onChange={(e)=>{const file=e.target.files?.[0]; if(file) void uploadGeoEvidence(file,"RECEIVED_PRODUCT",productEvidenceReceiptLine).catch((error)=>toast.error(error.message))}}/></label>
            {productEvidenceUploadId && <Button disabled={busy} onClick={()=>void action(()=>api.confirmReceivedProduct(caseId,productEvidenceReceiptLine,revision,productEvidenceUploadId),"Received product confirmed and forwarded for physical verification").then(()=>setProductEvidenceUploadId(""))}>Confirm exact received product</Button>}
            {detail.receipts.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "receipt_id")}
              >
                <strong>{value(item, "receipt_number")}</strong>
                <p className="text-sm text-muted-foreground">
                  Delivered {value(item, "actual_delivery_date")} ·{" "}
                  {value(item, "status")}
                </p>
              </div>
            ))}
            {detail.service_acceptances.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "service_acceptance_id")}
              >
                <strong>
                  Service milestone {value(item, "milestone") || "completion"}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {value(item, "accepted_quantity")} accepted ·{" "}
                  {value(item, "status")}
                </p>
              </div>
            ))}
            {!detail.receipts.length && !detail.service_acceptances.length && (
              <p className="py-8 text-center text-muted-foreground">
                No receipt or service-acceptance records.
              </p>
            )}
          </CardContent>
        </Card></div>
      )}

      {tab === "invoices" && (
        <Card>
          <CardHeader>
            <CardTitle>Finance invoice and payment queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50/40 p-4 lg:grid-cols-2">
              <div className="space-y-2 lg:col-span-2"><strong>P06 invoice entry</strong><p className="text-xs text-muted-foreground">Invoice entry is independent of Stores receiving. Upload the PDF or scan, select its order line, and enter the document values. The three-way match will record any receipt discrepancy later.</p></div>
              <select aria-label="Invoice order" className="h-10 rounded-md border px-3" value={invoice.order_id} onChange={(e)=>setInvoice({...invoice,order_id:e.target.value,order_line_id:""})}><option value="">Select issued order</option>{invoiceOrders.map((item)=><option key={value(item,"order_id")} value={value(item,"order_id")}>{value(item,"order_number")}</option>)}</select>
              <select aria-label="Invoice order line" className="h-10 rounded-md border px-3" value={invoice.order_line_id} onChange={(e)=>{const line=invoiceOrderLines.find((item)=>value(item,"order_line_id")===e.target.value);setInvoice({...invoice,order_line_id:e.target.value,quantity:Number(line?.quantity??1),unit_price:Number(line?.unit_price??0)})}}><option value="">Select order line</option>{invoiceOrderLines.map((item)=><option key={value(item,"order_line_id")} value={value(item,"order_line_id")}>{value(item,"product_name") || "Order item"} · {value(item,"quantity")}</option>)}</select>
              <Input aria-label="Invoice number" placeholder="Invoice number" value={invoice.invoice_number} onChange={(e)=>setInvoice({...invoice,invoice_number:e.target.value})}/>
              <Input aria-label="Invoice date" type="date" value={invoice.invoice_date} onChange={(e)=>setInvoice({...invoice,invoice_date:e.target.value})}/>
              <Input aria-label="Invoice quantity" type="number" min="0.001" step="0.001" value={invoice.quantity} onChange={(e)=>setInvoice({...invoice,quantity:Number(e.target.value)})}/>
              <Input aria-label="Invoice unit price" type="number" min="0" step="0.01" value={invoice.unit_price} onChange={(e)=>setInvoice({...invoice,unit_price:Number(e.target.value)})}/>
              <label className="rounded-md border border-dashed bg-white p-3 text-sm font-medium">Upload invoice PDF or scan<input className="mt-2 block w-full" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e)=>void uploadInvoice(e.target.files?.[0])}/></label>
              <div className="space-y-2"><Button variant="outline" onClick={()=>void download(api.sampleInvoice(),"falcon-module2-test-invoice.pdf")}>Download test invoice PDF</Button>{invoice.document_upload_id && <p className="text-xs text-emerald-700">Invoice upload ready</p>}</div>
              <Button className="lg:col-span-2" disabled={busy || !invoice.order_id || !invoice.order_line_id || !invoice.document_upload_id || !invoice.invoice_number} onClick={()=>void action(()=>api.createInvoice(caseId,invoice.order_id,revision,{invoice_number:invoice.invoice_number,invoice_date:invoice.invoice_date,currency:detail.currency,document_upload_id:invoice.document_upload_id,invoice_type:"ONLINE_INSTITUTIONAL",lines:[{order_line_id:invoice.order_line_id,quantity:invoice.quantity,unit_price:invoice.unit_price}]}),"Invoice entered; integrity and match checks can now proceed")}>Save invoice</Button>
            </div>
            {detail.invoices.map((item) => {
              const id = value(item, "invoice_id");
              const integrity = detail.integrity_projections.find(
                (projection) => value(projection, "invoice_id") === id,
              );
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
                >
                  <div>
                    <strong>{value(item, "invoice_number")}</strong>
                    <p className="text-sm text-muted-foreground">
                      {value(item, "status")} ·{" "}
                      {money(item.total_amount, detail.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Integrity:{" "}
                      {integrity
                        ? value(integrity, "final_decision").replaceAll(
                            "_",
                            " ",
                          )
                        : value(item, "integrity_status") || "PENDING"}
                      {integrity
                        ? ` · payment ${Boolean(integrity.payment_eligible) ? "eligible" : "blocked"}`
                        : " · exact revision clearance required when the gate activates"}
                    </p>
                    {integrity && (
                      <a
                        className="text-xs font-medium text-blue-700 underline"
                        href={`/finance/invoice-integrity/${value(integrity, "integrity_case_id")}`}
                      >
                        Open integrity evidence timeline
                      </a>
                    )}
                  </div>
                  {value(item, "status") === "ENTERED" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          () => api.verifyInvoice(caseId, id, revision),
                          "Invoice matched and verified",
                        )
                      }
                    >
                      Run 3-way match & verify
                    </Button>
                  )}
                </div>
              );
            })}
            {!detail.invoices.length && (
              <p className="py-8 text-center text-muted-foreground">
                No invoices entered.
              </p>
            )}
            <div className="rounded bg-slate-50 p-3 text-sm">
              <strong>Verified unpaid liability:</strong>{" "}
              {money(detail.verified_unpaid_liability, detail.currency)}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "funds" && (
        <Card>
          <CardHeader>
            <CardTitle>Append-only financial ledger</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.ledger.map((entry) => (
              <div
                key={value(entry, "ledger_entry_id")}
                className="grid gap-2 rounded border p-3 text-sm md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <strong>
                    {value(entry, "entry_type").replaceAll("_", " ")}
                  </strong>
                  <p className="font-mono text-xs text-muted-foreground">
                    {value(entry, "entry_hash").slice(0, 18)}…
                  </p>
                </div>
                <span>
                  {value(entry, "from_bucket") || "ALLOCATION"} →{" "}
                  {value(entry, "to_bucket")}
                </span>
                <strong>{money(entry.amount, detail.currency)}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === "returns" && (
        <Card>
          <CardHeader>
            <CardTitle>Returns, repairs, credits and refunds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {detail.returns.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "return_id")}
              >
                <strong>
                  {value(item, "quantity")} units · {value(item, "status")}
                </strong>
                <p className="text-sm text-muted-foreground">
                  Financial settlement: {value(item, "financial_status")} ·{" "}
                  {value(item, "reason")}
                </p>
              </div>
            ))}
            {detail.adjustments.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "adjustment_id")}
              >
                <strong>
                  {value(item, "adjustment_type").replaceAll("_", " ")}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {money(item.amount, detail.currency)} ·{" "}
                  {value(item, "status")}
                </p>
              </div>
            ))}
            {!detail.returns.length && !detail.adjustments.length && (
              <p className="py-8 text-center text-muted-foreground">
                No return or financial adjustment records.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "inventory" && (
        <Card>
          <CardHeader>
            <CardTitle>Read-only downstream verification</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Physical verification, RFID, asset identity, consumable ledger,
              and inventory ingestion are owned by later modules.
            </p>
            {detail.downstream_status.map((item) => (
              <div
                className="rounded border p-3"
                key={value(item, "downstream_status_id")}
              >
                <strong>
                  {value(item, "status_type").replaceAll("_", " ")}
                </strong>
                <p className="text-sm text-muted-foreground">
                  {value(item, "status")} · sequence{" "}
                  {value(item, "aggregate_sequence")}
                </p>
              </div>
            ))}
            {!detail.downstream_status.length && (
              <p className="py-8 text-center text-muted-foreground">
                Awaiting downstream status events.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {tab === "audit" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Hash-chained change history</CardTitle>
              <Button
                disabled={busy || detail.status === "FINALIZED"}
                onClick={() =>
                  void action(
                    () => api.finalize(caseId, revision, key("finalize")),
                    "Procurement case finalized",
                  )
                }
              >
                Finalize when ready
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {detail.audit_timeline.map((event) => (
              <div
                className="rounded border p-3 text-sm"
                key={value(event, "audit_event_id")}
              >
                <strong>
                  {value(event, "event_type").replaceAll("_", " ")}
                </strong>
                <p className="text-xs text-muted-foreground">
                  {new Date(value(event, "created_at")).toLocaleString("en-IN")}{" "}
                  · {value(event, "event_hash").slice(0, 20)}…
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
