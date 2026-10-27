import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { listOpenPrs } from "../src/tools/listOpenPrs.js";

function fakeOctokit(prs: unknown[]) {
  const list = vi.fn().mockResolvedValue({ data: prs });
  return { octokit: { pulls: { list } } as unknown as Octokit, list };
}

describe("listOpenPrs", () => {
  it("requests open PRs sorted by most recently updated", async () => {
    const { octokit, list } = fakeOctokit([]);

    await listOpenPrs(octokit, { owner: "acme", repo: "app", limit: 5 });

    expect(list).toHaveBeenCalledWith({
      owner: "acme",
      repo: "app",
      state: "open",
      sort: "updated",
      direction: "desc",
      per_page: 5,
    });
  });

  it("trims GitHub's response down to the useful fields", async () => {
    const { octokit } = fakeOctokit([
      {
        number: 42,
        title: "Add login page",
        user: { login: "deepthi" },
        html_url: "https://github.com/acme/app/pull/42",
        draft: false,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-02T00:00:00Z",
        body: "lots of extra fields we don't need",
      },
    ]);

    const prs = await listOpenPrs(octokit, { owner: "acme", repo: "app", limit: 20 });

    expect(prs).toEqual([
      {
        number: 42,
        title: "Add login page",
        author: "deepthi",
        url: "https://github.com/acme/app/pull/42",
        draft: false,
        createdAt: "2026-10-01T00:00:00Z",
        updatedAt: "2026-10-02T00:00:00Z",
      },
    ]);
  });

  it("handles PRs from deleted users", async () => {
    const { octokit } = fakeOctokit([
      { number: 1, title: "t", user: null, html_url: "u", created_at: "c", updated_at: "u" },
    ]);

    const [pr] = await listOpenPrs(octokit, { owner: "a", repo: "b", limit: 1 });

    expect(pr.author).toBe("unknown");
    expect(pr.draft).toBe(false);
  });
});
