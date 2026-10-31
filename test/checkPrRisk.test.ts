import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { checkPrRisk } from "../src/tools/checkPrRisk.js";

function fakeOctokit(files: unknown[]) {
  const listFiles = vi.fn();
  const paginate = vi.fn().mockResolvedValue(files);
  return { octokit: { paginate, pulls: { listFiles } } as unknown as Octokit, paginate, listFiles };
}

const args = { owner: "acme", repo: "app", pullNumber: 7 };

describe("checkPrRisk", () => {
  it("runs the rules over the PR's files", async () => {
    const { octokit, paginate, listFiles } = fakeOctokit([
      { filename: "src/a.ts", status: "modified", additions: 3, deletions: 1, patch: "@@ -1 +1 @@\n+debugger;" },
    ]);

    const risk = await checkPrRisk(octokit, args);

    expect(paginate).toHaveBeenCalledWith(listFiles, { owner: "acme", repo: "app", pull_number: 7, per_page: 100 });
    expect(risk.level).toBe("medium");
    expect(risk.findings.map((f) => f.rule)).toEqual(["no_tests", "debug_code"]);
  });

  it("lists files that could not be scanned, except generated ones", async () => {
    const { octokit } = fakeOctokit([
      { filename: "assets/logo.png", status: "added", additions: 0, deletions: 0 },
      { filename: "package-lock.json", status: "modified", additions: 900, deletions: 100 },
      { filename: "README.md", status: "modified", additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+hi" },
    ]);

    const risk = await checkPrRisk(octokit, args);

    expect(risk.unscannedFiles).toEqual(["assets/logo.png"]);
    expect(risk.level).toBe("none");
  });
});
