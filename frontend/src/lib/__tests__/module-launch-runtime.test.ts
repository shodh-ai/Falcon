import { describe, expect, it } from "vitest";
import {
  filterPortalConfigForLaunchModules,
  resolvePathModule,
  runtimeModuleForPath,
  type RuntimeModuleManifest,
} from "@/lib/launch-modules";

const manifest: RuntimeModuleManifest = {
  revision: "r1",
  generatedAt: new Date(0).toISOString(),
  cacheSeconds: 30,
  modules: [
    {
      moduleKey: "finance_procurement",
      displayName: "Finance, Procurement & P2P",
      state: "OFF",
      available: false,
      revision: 2,
      sourceScope: "TENANT",
      updatedAt: null,
    },
    {
      moduleKey: "inventory_assets",
      displayName: "Inventory & Asset Lifecycle",
      state: "PILOT",
      available: true,
      revision: 4,
      sourceScope: "DEPARTMENT",
      updatedAt: null,
    },
    {
      moduleKey: "library",
      displayName: "Library",
      state: "PAUSED",
      available: false,
      revision: 3,
      sourceScope: "GLOBAL",
      updatedAt: null,
    },
  ],
};

describe("runtime module launch filtering", () => {
  it("selects the most specific route owner", () => {
    expect(resolvePathModule("/finance/inventory/abc")).toBe(
      "inventory_assets",
    );
    expect(resolvePathModule("/finance/acquisitions")).toBe(
      "finance_procurement",
    );
    expect(resolvePathModule("/faculty/library/abc")).toBe("library");
    expect(resolvePathModule("/operations/esm")).toBe("helpdesk_esm");
  });

  it("reports unavailable direct routes from the manifest", () => {
    expect(
      runtimeModuleForPath(manifest, "/finance/acquisitions"),
    ).toMatchObject({ state: "OFF", available: false });
    expect(runtimeModuleForPath(manifest, "/finance/inventory")).toMatchObject({
      state: "PILOT",
      available: true,
    });
  });

  it("removes disabled navigation without removing unrelated or pilot navigation", () => {
    const config = {
      navGroups: [
        {
          items: [
            { href: "/finance/acquisitions" },
            { href: "/finance/inventory" },
            { href: "/settings" },
          ],
        },
      ],
      commandItems: [{ href: "/library" }, { href: "/finance/inventory" }],
    };
    const filtered = filterPortalConfigForLaunchModules(config, manifest);
    expect(filtered.navGroups[0].items.map((item) => item.href)).toEqual([
      "/finance/inventory",
      "/settings",
    ]);
    expect(filtered.commandItems.map((item) => item.href)).toEqual([
      "/finance/inventory",
    ]);
  });
});
