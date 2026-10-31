import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { summarizePr } from "../src/tools/summarizePr.js";

const basePr = {
  number: 7,
  title: "Add login page",
  html_url: "https://github.com/acme/app/pull/7",
  user: { login: "deepthi" },
  state: "open",
  merged_at: null,
  draft: false,
  base: { ref: "main" },
  head: { ref: "feat/login", sha: "abc123" },
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  body: "Adds a login page.",
  labels: [{ name: "feature" }],
  changed_files: 3,
  additions: 120,
  deletions: 10,
  commits: 2,
  requested_reviewers: [{ login: "alice" }],
};

function fakeOctokit({
  pr = {},
  files = [] as { filename: string }[],
  reviews = [] as unknown[],
  checkRuns = [] as unknown[],
  checksError = false,
} = {}) {
  const listFiles = vi.fn();
  const listReviews = vi.fn();
  const listForRef = checksError
    ? vi.fn().mockRejectedValue(new Error("Resource not accessible"))
    : vi.fn().mockResolvedValue({ data: { check_runs: checkRuns } });
  const octokit = {
    pulls: { get: vi.fn().mockResolvedValue({ data: { ...basePr, ...pr } }), listFiles, listReviews },
    checks: { listForRef },
    paginate: vi.fn(async (endpoint: unknown) => (endpoint === listFiles ? files : reviews)),
  } as unknown as Octokit;
  return { octokit, listForRef };
}

const args = { owner: "acme", repo: "app", pullNumber: 7 };

describe("summarizePr", () => {
  it("summarizes the PR's metadata and size", async () => {
    const { octokit } = fakeOctokit();

    const summary = await summarizePr(octokit, args);

    expect(summary).toMatchObject({
      number: 7,
      title: "Add login page",
      author: "deepthi",
      state: "open",
      base: "main",
      head: "feat/login",
      description: "Adds a login page.",
      descriptionTruncated: false,
      labels: ["feature"],
      size: { files: 3, additions: 120, deletions: 10, commits: 2 },
      reviews: { requestedReviewers: ["alice"] },
    });
  });

  it("reports merged PRs as merged, not closed", async () => {
    const { octokit } = fakeOctokit({ pr: { state: "closed", merged_at: "2026-10-03T00:00:00Z" } });

    expect((await summarizePr(octokit, args)).state).toBe("merged");
  });

  it("strips template comments and truncates long descriptions", async () => {
    const { octokit } = fakeOctokit({ pr: { body: `<!-- describe your change -->\n${"x".repeat(2_500)}` } });

    const summary = await summarizePr(octokit, args);

    expect(summary.description).toBe("x".repeat(2_000));
    expect(summary.descriptionTruncated).toBe(true);
  });

  it("counts file types and sorts areas by most files", async () => {
    const { octokit } = fakeOctokit({
      files: [
        { filename: "packages/server/src/mcp.ts" },
        { filename: "packages/server/test/mcp.test.ts" },
        { filename: "README.md" },
      ],
    });

    const summary = await summarizePr(octokit, args);

    expect(summary.fileTypes).toEqual({ source: 1, test: 1, docs: 1, config: 0, asset: 0, generated: 0 });
    expect(summary.areas).toEqual([
      { area: "packages/server", files: 2 },
      { area: "(root)", files: 1 },
    ]);
  });

  it("uses each reviewer's latest decision and ignores plain comments", async () => {
    const { octokit } = fakeOctokit({
      reviews: [
        { state: "CHANGES_REQUESTED", user: { login: "alice" } },
        { state: "APPROVED", user: { login: "alice" } },
        { state: "CHANGES_REQUESTED", user: { login: "bob" } },
        { state: "COMMENTED", user: { login: "bob" } },
        { state: "APPROVED", user: { login: "carol" } },
      ],
    });

    const { reviews } = await summarizePr(octokit, args);

    expect(reviews).toMatchObject({ approvals: 2, changesRequested: ["bob"] });
  });

  it("summarizes CI checks for the head commit", async () => {
    const { octokit, listForRef } = fakeOctokit({
      checkRuns: [
        { name: "build", status: "completed", conclusion: "success" },
        { name: "lint", status: "completed", conclusion: "skipped" },
        { name: "test", status: "completed", conclusion: "failure" },
        { name: "e2e", status: "in_progress", conclusion: null },
      ],
    });

    const { checks } = await summarizePr(octokit, args);

    expect(listForRef).toHaveBeenCalledWith({ owner: "acme", repo: "app", ref: "abc123", per_page: 100 });
    expect(checks).toEqual({ total: 4, passed: 2, failed: ["test"], pending: 1 });
  });

  it("returns null checks instead of failing when CI can't be read", async () => {
    const { octokit } = fakeOctokit({ checksError: true });

    const summary = await summarizePr(octokit, args);

    expect(summary.checks).toBeNull();
    expect(summary.title).toBe("Add login page");
  });
});
