import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { fitHunks, isGeneratedFile } from "../diff.js";

export const getPrDiffInput = {
  owner: z.string().describe("Repository owner (user or org), e.g. 'vercel'"),
  repo: z.string().describe("Repository name, e.g. 'next.js'"),
  pullNumber: z.number().int().positive().describe("Pull request number"),
  files: z
    .array(z.string())
    .optional()
    .describe(
      "Only return these file paths. Use this to drill into files that were truncated or omitted in an earlier call.",
    ),
  maxChars: z
    .number()
    .int()
    .min(1_000)
    .max(200_000)
    .default(20_000)
    .describe("Character budget for all patches combined (roughly 4 characters per token)"),
};

export interface GetPrDiffArgs {
  owner: string;
  repo: string;
  pullNumber: number;
  files?: string[];
  maxChars: number;
}

export type OmitReason = "binary_or_too_large" | "generated" | "budget_exhausted";

export interface FileDiff {
  path: string;
  status: string;
  previousPath?: string;
  additions: number;
  deletions: number;
  patch?: string;
  hunks?: { shown: number; total: number };
  omitted?: OmitReason;
}

export interface PrDiff {
  totalFiles: number;
  additions: number;
  deletions: number;
  truncated: boolean;
  files: FileDiff[];
}

export async function getPrDiff(
  octokit: Octokit,
  { owner, repo, pullNumber, files, maxChars }: GetPrDiffArgs,
): Promise<PrDiff> {
  // GitHub returns at most 100 files per page; paginate fetches every page.
  const allFiles = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const selected = files ? allFiles.filter((f) => files.includes(f.filename)) : allFiles;
  let remaining = maxChars;
  let truncated = false;

  const diffs = selected.map((f): FileDiff => {
    const base: FileDiff = {
      path: f.filename,
      status: f.status,
      ...(f.previous_filename && { previousPath: f.previous_filename }),
      additions: f.additions,
      deletions: f.deletions,
    };

    // GitHub omits the patch for binary files and very large diffs.
    if (!f.patch) return { ...base, omitted: "binary_or_too_large" };

    // Skip generated files unless the caller asked for them by name.
    if (!files && isGeneratedFile(f.filename)) return { ...base, omitted: "generated" };

    const fitted = fitHunks(f.patch, remaining);
    if (fitted.shownHunks === 0) {
      truncated = true;
      return { ...base, omitted: "budget_exhausted" };
    }

    remaining -= fitted.patch.length;
    if (fitted.shownHunks < fitted.totalHunks) truncated = true;

    return {
      ...base,
      patch: fitted.patch,
      hunks: { shown: fitted.shownHunks, total: fitted.totalHunks },
    };
  });

  return {
    totalFiles: allFiles.length,
    additions: allFiles.reduce((sum, f) => sum + f.additions, 0),
    deletions: allFiles.reduce((sum, f) => sum + f.deletions, 0),
    truncated,
    files: diffs,
  };
}
