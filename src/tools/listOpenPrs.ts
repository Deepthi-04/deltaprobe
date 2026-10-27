import type { Octokit } from "@octokit/rest";
import { z } from "zod";

// The AI reads these descriptions to learn what arguments to send.
export const listOpenPrsInput = {
  owner: z.string().describe("Repository owner (user or org), e.g. 'vercel'"),
  repo: z.string().describe("Repository name, e.g. 'next.js'"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of PRs to return (1-100)"),
};

export interface ListOpenPrsArgs {
  owner: string;
  repo: string;
  limit: number;
}

export interface PrSummary {
  number: number;
  title: string;
  author: string;
  url: string;
  draft: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function listOpenPrs(
  octokit: Octokit,
  { owner, repo, limit }: ListOpenPrsArgs,
): Promise<PrSummary[]> {
  const { data } = await octokit.pulls.list({
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: limit,
  });

  // GitHub returns 100+ fields per PR; keep only what's useful to the AI.
  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    author: pr.user?.login ?? "unknown",
    url: pr.html_url,
    draft: pr.draft ?? false,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  }));
}
