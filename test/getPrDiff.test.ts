import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { getPrDiff } from "../src/tools/getPrDiff.js";

function file(filename: string, patch?: string, extra: Record<string, unknown> = {}) {
  return { filename, status: "modified", additions: 1, deletions: 1, patch, ...extra };
}

function fakeOctokit(files: unknown[]) {
  const listFiles = vi.fn();
  const paginate = vi.fn().mockResolvedValue(files);
  return { octokit: { paginate, pulls: { listFiles } } as unknown as Octokit, paginate, listFiles };
}

const args = { owner: "acme", repo: "app", pullNumber: 7, maxChars: 20_000 };

describe("getPrDiff", () => {
  it("paginates through all changed files of the PR", async () => {
    const { octokit, paginate, listFiles } = fakeOctokit([]);

    await getPrDiff(octokit, args);

    expect(paginate).toHaveBeenCalledWith(listFiles, {
      owner: "acme",
      repo: "app",
      pull_number: 7,
      per_page: 100,
    });
  });

  it("returns patches with hunk counts and totals", async () => {
    const { octokit } = fakeOctokit([
      file("src/a.ts", "@@ -1 +1 @@\n-a\n+b", { additions: 3, deletions: 2 }),
      file("src/b.ts", "@@ -1 +1 @@\n-c\n+d", { additions: 4, deletions: 0 }),
    ]);

    const diff = await getPrDiff(octokit, args);

    expect(diff).toMatchObject({ totalFiles: 2, additions: 7, deletions: 2, truncated: false });
    expect(diff.files[0]).toEqual({
      path: "src/a.ts",
      status: "modified",
      additions: 3,
      deletions: 2,
      patch: "@@ -1 +1 @@\n-a\n+b",
      hunks: { shown: 1, total: 1 },
    });
  });

  it("explains why a file has no patch", async () => {
    const { octokit } = fakeOctokit([file("logo.png"), file("package-lock.json", "@@ -1 +1 @@\n-x\n+y")]);

    const diff = await getPrDiff(octokit, args);

    expect(diff.files.map((f) => f.omitted)).toEqual(["binary_or_too_large", "generated"]);
  });

  it("includes generated files when asked for by name", async () => {
    const { octokit } = fakeOctokit([file("src/a.ts", "@@ -1 +1 @@\n+a"), file("package-lock.json", "@@ -1 +1 @@\n+y")]);

    const diff = await getPrDiff(octokit, { ...args, files: ["package-lock.json"] });

    expect(diff.totalFiles).toBe(2);
    expect(diff.files).toHaveLength(1);
    expect(diff.files[0].patch).toBe("@@ -1 +1 @@\n+y");
  });

  it("marks files past the budget and sets truncated", async () => {
    const big = "@@ -1 +1 @@\n+" + "x".repeat(900);
    const { octokit } = fakeOctokit([file("src/a.ts", big), file("src/b.ts", big)]);

    const diff = await getPrDiff(octokit, { ...args, maxChars: 1_000 });

    expect(diff.truncated).toBe(true);
    expect(diff.files[0].patch).toBe(big);
    expect(diff.files[1].omitted).toBe("budget_exhausted");
  });

  it("keeps the previous path of renamed files", async () => {
    const { octokit } = fakeOctokit([
      file("src/new.ts", "@@ -1 +1 @@\n+a", { status: "renamed", previous_filename: "src/old.ts" }),
    ]);

    const [renamed] = (await getPrDiff(octokit, args)).files;

    expect(renamed).toMatchObject({ status: "renamed", previousPath: "src/old.ts" });
  });
});
