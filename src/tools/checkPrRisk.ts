import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { isGeneratedFile } from "../diff.js";
import { assessRisk, type RiskAssessment } from "../risk/rules.js";

export const checkPrRiskInput = {
  owner: z.string().describe("Repository owner (user or org), e.g. 'vercel'"),
  repo: z.string().describe("Repository name, e.g. 'next.js'"),
  pullNumber: z.number().int().positive().describe("Pull request number"),
};

export interface CheckPrRiskArgs {
  owner: string;
  repo: string;
  pullNumber: number;
}

export interface PrRisk extends RiskAssessment {
  // Files GitHub sent no patch for, so their contents could not be scanned.
  unscannedFiles: string[];
}

export async function checkPrRisk(
  octokit: Octokit,
  { owner, repo, pullNumber }: CheckPrRiskArgs,
): Promise<PrRisk> {
  const files = await octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const assessment = assessRisk(
    files.map((f) => ({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch,
    })),
  );

  return {
    ...assessment,
    unscannedFiles: files.filter((f) => !f.patch && !isGeneratedFile(f.filename)).map((f) => f.filename),
  };
}
