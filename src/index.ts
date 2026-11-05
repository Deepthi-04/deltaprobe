#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGitHubClient } from "./github.js";
import { checkPrRisk, checkPrRiskInput } from "./tools/checkPrRisk.js";
import { getPrDiff, getPrDiffInput } from "./tools/getPrDiff.js";
import { listOpenPrs, listOpenPrsInput } from "./tools/listOpenPrs.js";
import { postReviewComment, postReviewCommentInput } from "./tools/postReviewComment.js";
import { summarizePr, summarizePrInput } from "./tools/summarizePr.js";

const server = new McpServer({ name: "deltaprobe", version: "0.1.0" });
const octokit = createGitHubClient();

// Tells clients these tools only read from GitHub and never modify anything.
const readOnly = { readOnlyHint: true, openWorldHint: true };

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool(
  "list_open_prs",
  {
    title: "List open pull requests",
    description:
      "List open pull requests in a GitHub repository, most recently updated first. " +
      "Use this to find which PR to review.",
    inputSchema: listOpenPrsInput,
    annotations: readOnly,
  },
  async (args) => jsonResult(await listOpenPrs(octokit, args)),
);

server.registerTool(
  "summarize_pr",
  {
    title: "Summarize pull request",
    description:
      "Get an overview of a pull request without its diff: title, description, author, branches, labels, " +
      "size, file types (source/test/docs/config/generated), most-touched areas, review status and CI check results. " +
      "Call this first when reviewing a PR, then use get_pr_diff to read the code.",
    inputSchema: summarizePrInput,
    annotations: readOnly,
  },
  async (args) => jsonResult(await summarizePr(octokit, args)),
);

server.registerTool(
  "get_pr_diff",
  {
    title: "Get pull request diff",
    description:
      "Get the changed files and unified diff hunks of a pull request. " +
      "Patches are trimmed to whole hunks within a character budget; lock files and build output are skipped. " +
      "Every file is listed, and files without a patch have an 'omitted' reason. " +
      "If 'truncated' is true, call again with 'files' to read specific files in full.",
    inputSchema: getPrDiffInput,
    annotations: readOnly,
  },
  async (args) => jsonResult(await getPrDiff(octokit, args)),
);

server.registerTool(
  "check_pr_risk",
  {
    title: "Check pull request risk",
    description:
      "Run rule-based risk checks on a pull request: possible secrets in added lines (masked), sensitive files, " +
      "large diffs, source changes without tests, CI workflow, migration and dependency changes, and leftover debug code. " +
      "Returns an overall level (none/low/medium/high) and findings with file and line where possible. " +
      "These are heuristics: confirm each finding by reading the code with get_pr_diff before reporting it.",
    inputSchema: checkPrRiskInput,
    annotations: readOnly,
  },
  async (args) => jsonResult(await checkPrRisk(octokit, args)),
);

server.registerTool(
  "post_review_comment",
  {
    title: "Post pull request review",
    description:
      "Post a review on a pull request: an overall summary plus optional inline comments on specific lines. " +
      "Inline comments must target lines in the PR's diff (RIGHT = new version, LEFT = removed lines); " +
      "they're all checked first, and nothing is posted if any is invalid. " +
      "Defaults to a neutral COMMENT review. Use dryRun to preview. Requires a GITHUB_TOKEN that can write to pull requests. " +
      "Only post when the user has asked you to.",
    inputSchema: postReviewCommentInput,
    // Writes to GitHub, and each call adds a new review.
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  },
  async (args) => jsonResult(await postReviewComment(octokit, args)),
);

// stdout carries MCP protocol messages, so logs must go to stderr.
await server.connect(new StdioServerTransport());
console.error("deltaprobe MCP server running on stdio");
