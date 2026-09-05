import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const repositoryRoot = join(frontendRoot, "..");

describe("production resource guardrails", () => {
  it("keeps the Next.js build within the shared-host envelope", () => {
    const config = readFileSync(join(frontendRoot, "next.config.ts"), "utf8");
    const packageJson = readFileSync(join(frontendRoot, "package.json"), "utf8");
    expect(config).toContain("cpus: 2");
    expect(config).toContain("memoryBasedWorkersCount: false");
    expect(packageJson).toContain("--max-old-space-size=2048");
  });

  it("keeps runtime containers bounded and health checked", () => {
    const frontendDockerfile = readFileSync(
      join(frontendRoot, "Dockerfile"),
      "utf8",
    );
    const backendDockerfile = readFileSync(
      join(repositoryRoot, "backend", "Dockerfile"),
      "utf8",
    );
    const backendCompose = readFileSync(
      join(repositoryRoot, "backend", "docker-compose.yaml"),
      "utf8",
    );
    expect(frontendDockerfile).toContain("NODE_OPTIONS=--max-old-space-size=768");
    expect(frontendDockerfile).toContain("HEALTHCHECK");
    expect(backendDockerfile).toContain("NODE_OPTIONS=--max-old-space-size=768");
    expect(backendDockerfile).toContain("/health");
    expect(backendCompose).toContain("mem_limit: 1g");
    expect(backendCompose).toContain("cpus: 1.5");
    expect(backendCompose).toContain("pids_limit: 256");
  });
});
