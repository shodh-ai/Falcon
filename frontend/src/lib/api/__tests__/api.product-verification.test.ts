import { createProductVerificationApi } from "../api.product-verification";

describe("product-verification API", () => {
  it("uses the Module 4 scoped routes and concurrency headers", async () => {
    const get = vi.fn().mockResolvedValue([]);
    const post = vi.fn().mockResolvedValue({});
    const api = createProductVerificationApi({ get, post });
    await api.list("MANUAL_REVIEW");
    await api.get("case-1");
    await api.createLot("case-1", 3, { observed_quantity: 20, unit_of_measure: "box" });
    expect(get).toHaveBeenNthCalledWith(1, "/api/product-verification/v1/cases?state=MANUAL_REVIEW");
    expect(get).toHaveBeenNthCalledWith(2, "/api/product-verification/v1/cases/case-1");
    expect(post).toHaveBeenCalledWith(
      "/api/product-verification/v1/cases/case-1/lots",
      { observed_quantity: 20, unit_of_measure: "box" },
      { "If-Match": "3" },
    );
  });
});
