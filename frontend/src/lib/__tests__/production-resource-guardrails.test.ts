import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const frontendRoot = process.cwd();
const repositoryRoot = join(frontendRoot, "..");

describe("production resource guardrails", () => {
  it("bounds Next.js build fan-out on local and CI builders", () => {
    const config = readFileSync(join(frontendRoot, "next.config.ts"), "utf8");
    const packageJson = readFileSync(
      join(frontendRoot, "package.json"),
      "utf8",
    );
    expect(config).toContain("cpus: 2");
    expect(config).toContain("memoryBasedWorkersCount: false");
    expect(packageJson).toContain("--max-old-space-size=2048");
  });

  it("publishes tested images off-host before protected promotion", () => {
    const publishWorkflow = readFileSync(
      join(
        repositoryRoot,
        ".github",
        "workflows",
        "publish-production-images.yml",
      ),
      "utf8",
    );
    const promoteWorkflow = readFileSync(
      join(
        repositoryRoot,
        ".github",
        "workflows",
        "promote-production-images.yml",
      ),
      "utf8",
    );

    expect(publishWorkflow).toContain("workflow_run:");
    expect(publishWorkflow).toContain("conclusion == 'success'");
    expect(publishWorkflow).toContain("platforms: linux/amd64");
    expect(publishWorkflow).toContain("ghcr.io/shodh-ai/falcon-frontend");
    expect(publishWorkflow).toContain("ghcr.io/shodh-ai/falcon-backend");
    expect(promoteWorkflow).toContain("environment: production");
    expect(promoteWorkflow).toContain("sha-$RELEASE_SHA");
    expect(promoteWorkflow).toContain("falcon-backend:production");
    expect(promoteWorkflow).toContain("falcon-frontend:production");
    expect(promoteWorkflow.indexOf("deploy-backend:")).toBeLessThan(
      promoteWorkflow.indexOf("deploy-frontend:"),
    );
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
    expect(frontendDockerfile).toContain(
      "NODE_OPTIONS=--max-old-space-size=768",
    );
    expect(frontendDockerfile).toContain("HEALTHCHECK");
    expect(backendDockerfile).toContain(
      "NODE_OPTIONS=--max-old-space-size=768",
    );
    expect(backendDockerfile).toContain("/health");
    expect(backendCompose).toContain("mem_limit: 1g");
    expect(backendCompose).toContain("cpus: 1.5");
    expect(backendCompose).toContain("pids_limit: 256");
  });
});
