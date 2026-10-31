import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { areaOf, fileType, type FileType } from "../files.js";

export const summarizePrInput = {
  owner: z.string().describe("Repository owner (user or org), e.g. 'vercel'"),
  repo: z.string().describe("Repository name, e.g. 'next.js'"),
  pullNumber: z.number().int().positive().describe("Pull request number"),
};

export interface SummarizePrArgs {
  owner: string;
  repo: string;
  pullNumber: number;
}

const MAX_DESCRIPTION_CHARS = 2_000;
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out", "cancelled", "action_required"]);

export interface PrSummary {
  number: number;
  title: string;
  url: string;
  author: string;
  state: "open" | "closed" | "merged";
  draft: boolean;
  base: string;
  head: string;
  createdAt: string;
  updatedAt: string;
  description: string;
  descriptionTruncated: boolean;
  labels: string[];
  size: { files: number; additions: number; deletions: number; commits: number };
  fileTypes: Record<FileType, number>;
  areas: { area: string; files: number }[];
  reviews: { approvals: number; changesRequested: string[]; requestedReviewers: string[] };
  checks: { total: number; passed: number; failed: string[]; pending: number } | null;
}

export async function summarizePr(
  octokit: Octokit,
  { owner, repo, pullNumber }: SummarizePrArgs,
): Promise<PrSummary> {
  const params = { owner, repo, pull_number: pullNumber };

  // These three calls don't depend on each other, so run them in parallel.
  const [{ data: pr }, files, reviews] = await Promise.all([
    octokit.pulls.get(params),
    octokit.paginate(octokit.pulls.listFiles, { ...params, per_page: 100 }),
    octokit.paginate(octokit.pulls.listReviews, { ...params, per_page: 100 }),
  ]);

  // PR templates are full of <!-- hints -->; they only waste tokens.
  const body = (pr.body ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();

  return {
    number: pr.number,
    title: pr.title,
    url: pr.html_url,
    author: pr.user?.login ?? "unknown",
    state: pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : "open",
    draft: pr.draft ?? false,
    base: pr.base.ref,
    head: pr.head.ref,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    description: body.slice(0, MAX_DESCRIPTION_CHARS),
    descriptionTruncated: body.length > MAX_DESCRIPTION_CHARS,
    labels: pr.labels.map((l) => l.name),
    size: {
      files: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      commits: pr.commits,
    },
    fileTypes: countFileTypes(files.map((f) => f.filename)),
    areas: countAreas(files.map((f) => f.filename)),
    reviews: {
      ...summarizeReviews(reviews),
      requestedReviewers: (pr.requested_reviewers ?? []).map((r) => r.login),
    },
    checks: await summarizeChecks(octokit, owner, repo, pr.head.sha),
  };
}

function countFileTypes(paths: string[]): Record<FileType, number> {
  const counts: Record<FileType, number> = { source: 0, test: 0, docs: 0, config: 0, asset: 0, generated: 0 };
  for (const path of paths) counts[fileType(path)]++;
  return counts;
}

function countAreas(paths: string[]): { area: string; files: number }[] {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const area = areaOf(path);
    counts.set(area, (counts.get(area) ?? 0) + 1);
  }
  return [...counts].map(([area, files]) => ({ area, files })).sort((a, b) => b.files - a.files);
}

// Like GitHub: a reviewer's latest approve / request-changes counts; plain comments don't.
function summarizeReviews(reviews: { state: string; user: { login: string } | null }[]) {
  const latest = new Map<string, string>();
  for (const review of reviews) {
    if (review.user && ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(review.state)) {
      latest.set(review.user.login, review.state);
    }
  }
  const states = [...latest];
  return {
    approvals: states.filter(([, state]) => state === "APPROVED").length,
    changesRequested: states.filter(([, state]) => state === "CHANGES_REQUESTED").map(([login]) => login),
  };
}

async function summarizeChecks(octokit: Octokit, owner: string, repo: string, sha: string) {
  try {
    const { data } = await octokit.checks.listForRef({ owner, repo, ref: sha, per_page: 100 });
    const runs = data.check_runs;
    return {
      total: runs.length,
      passed: runs.filter((r) => r.status === "completed" && !FAILED_CONCLUSIONS.has(r.conclusion ?? "")).length,
      failed: runs.filter((r) => FAILED_CONCLUSIONS.has(r.conclusion ?? "")).map((r) => r.name),
      pending: runs.filter((r) => r.status !== "completed").length,
    };
  } catch {
    // Some tokens can't read checks; the rest of the summary is still useful.
    return null;
  }
}
