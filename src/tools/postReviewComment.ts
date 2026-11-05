import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { commentableLines } from "../diff.js";

const MAX_COMMENTS = 50;

export const postReviewCommentInput = {
  owner: z.string().describe("Repository owner (user or org), e.g. 'vercel'"),
  repo: z.string().describe("Repository name, e.g. 'next.js'"),
  pullNumber: z.number().int().positive().describe("Pull request number"),
  body: z.string().min(1).describe("Overall review summary, in Markdown"),
  event: z
    .enum(["COMMENT", "REQUEST_CHANGES", "APPROVE"])
    .default("COMMENT")
    .describe("COMMENT (default) leaves feedback without a verdict; REQUEST_CHANGES and APPROVE set the review status"),
  comments: z
    .array(
      z.object({
        path: z.string().describe("File path as shown in the PR, e.g. 'src/index.ts'"),
        line: z.number().int().positive().describe("Line number the comment applies to"),
        side: z
          .enum(["RIGHT", "LEFT"])
          .default("RIGHT")
          .describe("RIGHT = line in the new version (added/unchanged), LEFT = line in the old version (removed)"),
        body: z.string().min(1).describe("Comment text, in Markdown"),
      }),
    )
    .max(MAX_COMMENTS)
    .default([])
    .describe("Inline comments; each line must be part of the PR's diff"),
  dryRun: z
    .boolean()
    .default(false)
    .describe("Validate and preview the review without posting it"),
};

export interface InlineComment {
  path: string;
  line: number;
  side: "RIGHT" | "LEFT";
  body: string;
}

export interface PostReviewCommentArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
  comments: InlineComment[];
  dryRun: boolean;
}

export type PostReviewResult =
  | { posted: true; reviewId: number; url: string; event: string; comments: number }
  | { posted: false; dryRun: true; event: string; body: string; comments: InlineComment[] }
  | { posted: false; errors: string[] };

export async function postReviewComment(
  octokit: Octokit,
  { owner, repo, pullNumber, body, event, comments, dryRun }: PostReviewCommentArgs,
  { authenticated = Boolean(process.env.GITHUB_TOKEN) } = {},
): Promise<PostReviewResult> {
  // Fail before any API call: without a token GitHub would reject the write anyway.
  if (!dryRun && !authenticated) {
    return { posted: false, errors: ["Posting needs a GITHUB_TOKEN with write access to pull requests. Use dryRun to preview."] };
  }

  const params = { owner, repo, pull_number: pullNumber };
  const [{ data: pr }, files] = await Promise.all([
    octokit.pulls.get(params),
    octokit.paginate(octokit.pulls.listFiles, { ...params, per_page: 100 }),
  ]);

  if (pr.state !== "open") return { posted: false, errors: [`PR #${pullNumber} is ${pr.merged_at ? "merged" : "closed"}`] };

  // Check every comment up front so a bad line doesn't make GitHub reject the whole review.
  const patches = new Map(files.map((f) => [f.filename, f.patch]));
  const errors = comments.flatMap((c) => validateComment(c, patches));
  if (errors.length > 0) return { posted: false, errors };

  if (dryRun) return { posted: false, dryRun: true, event, body, comments };

  const { data: review } = await octokit.pulls.createReview({
    ...params,
    commit_id: pr.head.sha, // pin the review to the commit the line numbers came from
    body,
    event,
    comments: comments.map(({ path, line, side, body }) => ({ path, line, side, body })),
  });

  return { posted: true, reviewId: review.id, url: review.html_url, event, comments: comments.length };
}

function validateComment(c: InlineComment, patches: Map<string, string | undefined>): string[] {
  const where = `${c.path}:${c.line} (${c.side})`;
  if (!patches.has(c.path)) return [`${where}: file is not changed in this PR`];

  const patch = patches.get(c.path);
  if (!patch) return [`${where}: GitHub has no diff for this file (binary or too large), so it can't take inline comments`];

  const lines = commentableLines(patch)[c.side === "RIGHT" ? "right" : "left"];
  if (lines.has(c.line)) return [];
  return [`${where}: line is not in the diff; nearest commentable lines: ${nearest(lines, c.line).join(", ")}`];
}

function nearest(lines: Set<number>, target: number, count = 3): number[] {
  return [...lines]
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)
    .slice(0, count)
    .sort((a, b) => a - b);
}
