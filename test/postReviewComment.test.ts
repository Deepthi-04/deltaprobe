import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { postReviewComment, type PostReviewCommentArgs } from "../src/tools/postReviewComment.js";

// Old lines 10-12 become new lines 10-13: line 11 replaced by two added lines.
const PATCH = ["@@ -10,3 +10,4 @@ function login() {", " const a = 1;", "-const b = 2;", "+const b = 3;", "+const c = 4;", " return a;"].join("\n");

function fakeOctokit({ pr = {}, files = [{ filename: "src/login.ts", patch: PATCH }] as { filename: string; patch?: string }[] } = {}) {
  const listFiles = vi.fn();
  const createReview = vi.fn().mockResolvedValue({ data: { id: 99, html_url: "https://github.com/acme/app/pull/7#pullrequestreview-99" } });
  const octokit = {
    pulls: {
      get: vi.fn().mockResolvedValue({ data: { state: "open", merged_at: null, head: { sha: "abc123" }, ...pr } }),
      listFiles,
      createReview,
    },
    paginate: vi.fn().mockResolvedValue(files),
  } as unknown as Octokit;
  return { octokit, createReview };
}

const args: PostReviewCommentArgs = {
  owner: "acme",
  repo: "app",
  pullNumber: 7,
  body: "Looks good overall.",
  event: "COMMENT",
  comments: [],
  dryRun: false,
};
const auth = { authenticated: true };

describe("postReviewComment", () => {
  it("posts a review pinned to the PR's head commit", async () => {
    const { octokit, createReview } = fakeOctokit();
    const comments = [{ path: "src/login.ts", line: 12, side: "RIGHT" as const, body: "Why 4?" }];

    const result = await postReviewComment(octokit, { ...args, comments }, auth);

    expect(result).toEqual({
      posted: true,
      reviewId: 99,
      url: "https://github.com/acme/app/pull/7#pullrequestreview-99",
      event: "COMMENT",
      comments: 1,
    });
    expect(createReview).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      pull_number: 7,
      commit_id: "abc123",
      body: "Looks good overall.",
      event: "COMMENT",
      comments,
    });
  });

  it("accepts comments on removed lines with side LEFT", async () => {
    const { octokit, createReview } = fakeOctokit();

    const result = await postReviewComment(
      octokit,
      { ...args, comments: [{ path: "src/login.ts", line: 11, side: "LEFT", body: "Was 2 wrong?" }] },
      auth,
    );

    expect(result.posted).toBe(true);
    expect(createReview).toHaveBeenCalledOnce();
  });

  it("rejects lines outside the diff and suggests the nearest ones, posting nothing", async () => {
    const { octokit, createReview } = fakeOctokit();

    const result = await postReviewComment(
      octokit,
      { ...args, comments: [{ path: "src/login.ts", line: 40, side: "RIGHT", body: "?" }] },
      auth,
    );

    expect(result).toEqual({
      posted: false,
      errors: ["src/login.ts:40 (RIGHT): line is not in the diff; nearest commentable lines: 11, 12, 13"],
    });
    expect(createReview).not.toHaveBeenCalled();
  });

  it("rejects a LEFT comment on a line that was only added", async () => {
    const { octokit } = fakeOctokit();

    const result = await postReviewComment(
      octokit,
      { ...args, comments: [{ path: "src/login.ts", line: 13, side: "LEFT", body: "?" }] },
      auth,
    );

    expect(result.posted).toBe(false);
  });

  it("rejects files that aren't in the PR or have no patch", async () => {
    const { octokit, createReview } = fakeOctokit({ files: [{ filename: "logo.png" }] });

    const result = await postReviewComment(
      octokit,
      {
        ...args,
        comments: [
          { path: "src/other.ts", line: 1, side: "RIGHT", body: "?" },
          { path: "logo.png", line: 1, side: "RIGHT", body: "?" },
        ],
      },
      auth,
    );

    expect(result).toEqual({
      posted: false,
      errors: [
        "src/other.ts:1 (RIGHT): file is not changed in this PR",
        "logo.png:1 (RIGHT): GitHub has no diff for this file (binary or too large), so it can't take inline comments",
      ],
    });
    expect(createReview).not.toHaveBeenCalled();
  });

  it("previews without posting on dryRun, even without a token", async () => {
    const { octokit, createReview } = fakeOctokit();
    const comments = [{ path: "src/login.ts", line: 10, side: "RIGHT" as const, body: "Nit" }];

    const result = await postReviewComment(octokit, { ...args, comments, dryRun: true }, { authenticated: false });

    expect(result).toEqual({ posted: false, dryRun: true, event: "COMMENT", body: "Looks good overall.", comments });
    expect(createReview).not.toHaveBeenCalled();
  });

  it("refuses to post without a token before calling GitHub", async () => {
    const { octokit } = fakeOctokit();

    const result = await postReviewComment(octokit, args, { authenticated: false });

    expect(result).toMatchObject({ posted: false, errors: [expect.stringContaining("GITHUB_TOKEN")] });
    expect(octokit.pulls.get).not.toHaveBeenCalled();
  });

  it("refuses to review a merged PR", async () => {
    const { octokit, createReview } = fakeOctokit({ pr: { state: "closed", merged_at: "2026-10-03T00:00:00Z" } });

    const result = await postReviewComment(octokit, args, auth);

    expect(result).toEqual({ posted: false, errors: ["PR #7 is merged"] });
    expect(createReview).not.toHaveBeenCalled();
  });
});
