import { describe, expect, it, vi } from "vitest";
import {
  createAcquisitionsApi,
  type AcquisitionDraftInput,
} from "../api.acquisitions";

const draft: AcquisitionDraftInput = {
  intended_use_case: "Teaching laboratory",
  required_by_date: "2099-01-01",
  priority: "HIGH",
  funding_source_type: "DEPARTMENT",
  funding_source_id: "fund-1",
  currency: "INR",
  lines: [
    {
      acquisition_layout: "GENERAL",
      product_name: "Controller",
      category: "Electronics",
      quantity: 1,
      unit: "unit",
      technical_specifications: "16 GB",
      intended_use: "Robotics",
      estimated_unit_price: 1000,
      item_classification: "ASSET",
    },
  ],
};

describe("acquisition API contract", () => {
  it("uses the versioned, tenant-authenticated acquisition endpoints", async () => {
    const transport = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn().mockResolvedValue({}),
    };
    const api = createAcquisitionsApi(transport);
    await api.list("PENDING_DOFA");
    await api.create(draft);
    await api.validate("version-1");
    await api.submit("version-1");
    await api.withdraw("version-1");

    expect(transport.get).toHaveBeenCalledWith(
      "/api/acquisitions/v1?status=PENDING_DOFA",
    );
    expect(transport.post).toHaveBeenCalledWith("/api/acquisitions/v1", draft);
    expect(transport.post).toHaveBeenCalledWith(
      "/api/acquisitions/v1/versions/version-1/validate",
    );
    expect(transport.post).toHaveBeenCalledWith(
      "/api/acquisitions/v1/versions/version-1/submit",
    );
    expect(transport.post).toHaveBeenCalledWith(
      "/api/acquisitions/v1/versions/version-1/withdraw",
    );
  });

  it("sends per-line vendor choices and deviations as one atomic selection", async () => {
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn(),
    };
    const api = createAcquisitionsApi(transport);
    const selections = [
      {
        line_id: "line-1",
        vendor_id: "vendor-2",
        deviation_justification:
          "Required delivery date cannot be met by the top vendor.",
      },
    ];
    await api.selectVendors("version-1", selections);
    expect(transport.post).toHaveBeenCalledWith(
      "/api/acquisitions/v1/versions/version-1/vendor-selection",
      { selections },
    );
  });

  it("keeps Excel preview and explicit single-use commit separate", async () => {
    const transport = {
      get: vi.fn(),
      post: vi.fn().mockResolvedValue({}),
      put: vi.fn(),
    };
    const api = createAcquisitionsApi(transport);
    const form = new FormData();
    form.set("header", "{}");
    await api.previewImport(form);
    await api.commitImport("preview-1");
    expect(transport.post).toHaveBeenNthCalledWith(
      1,
      "/api/acquisitions/v1/imports/preview",
      form,
    );
    expect(transport.post).toHaveBeenNthCalledWith(
      2,
      "/api/acquisitions/v1/imports/preview-1/commit",
    );
  });
});
