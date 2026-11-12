# deltaprobe 🔍

[![CI](https://github.com/Deepthi-04/deltaprobe/actions/workflows/ci.yml/badge.svg)](https://github.com/Deepthi-04/deltaprobe/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/deltaprobe.svg)](https://www.npmjs.com/package/deltaprobe)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-io.github.Deepthi--04%2Fdeltaprobe-blue)](https://registry.modelcontextprotocol.io/v0.1/servers?search=deltaprobe)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> Give your AI assistant x-ray vision into pull requests.

**deltaprobe** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that lets AI assistants like Claude, Cursor and VS Code Copilot probe GitHub pull requests: list them, read their diffs, summarize changes, flag risky patches and post review comments.

Available on [npm](https://www.npmjs.com/package/deltaprobe) and the [official MCP Registry](https://registry.modelcontextprotocol.io/v0.1/servers?search=deltaprobe) as `io.github.Deepthi-04/deltaprobe`.

## Tools

| Tool | Status | Description |
|---|---|---|
| `list_open_prs` | ✅ | List open PRs in a repo, most recently updated first |
| `summarize_pr` | ✅ | Overview of a PR: description, size, file types, most-touched areas, review status and CI results |
| `get_pr_diff` | ✅ | Fetch changed files and diff hunks, trimmed to whole hunks within a character budget |
| `check_pr_risk` | ✅ | Rule-based risk checks: secrets in added lines (masked), sensitive files, large diffs, missing tests, CI/migration/dependency changes, debug code |
| `post_review_comment` | ✅ | Post a review with inline comments; every line is checked against the diff first, with a `dryRun` preview |

## How it works

```
You: "Review PR #42 in acme/app"
        │
        ▼
AI assistant ──(MCP over stdio)──► deltaprobe ──► GitHub API
        ▲                               │
        └──── structured PR data ◄──────┘
```

The assistant decides which deltaprobe tools to call, deltaprobe fetches and trims the data from GitHub, and the assistant writes the review.

## Quick start

### Prerequisites
- Node.js 20+ (22.12+ for development)
- A GitHub token ([create one](https://github.com/settings/personal-access-tokens)). Optional for reading public repos, but it raises the rate limit from 60 to 5,000 requests/hour. `post_review_comment` needs one with **Pull requests: Read and write** permission.

### Use with Claude Code

```bash
# public repos, read-only (no token)
claude mcp add deltaprobe -- npx -y deltaprobe

# with a token (higher rate limit, private repos, posting reviews)
claude mcp add deltaprobe -e GITHUB_TOKEN=<your-token> -- npx -y deltaprobe
```

### Use with Claude Desktop / Cursor

Add to your MCP config:

```json
{
  "mcpServers": {
    "deltaprobe": {
      "command": "npx",
      "args": ["-y", "deltaprobe"],
      "env": { "GITHUB_TOKEN": "<your-token>" }
    }
  }
}
```

Then ask: *"What are the open PRs in modelcontextprotocol/typescript-sdk?"*

## Development

```bash
git clone https://github.com/Deepthi-04/deltaprobe.git
cd deltaprobe
npm install
npm test          # run unit tests
npm run build     # compile TypeScript to dist/
npm run dev       # run the server from source
```

### Project structure

```
src/
├── index.ts          # MCP server entry: registers tools, connects over stdio
├── github.ts         # GitHub API client
├── diff.ts           # hunk splitting, budget fitting, commentable lines
├── files.ts          # file type and area classification
├── risk/rules.ts     # risk rules: each takes the PR's files and returns findings
└── tools/            # one file per tool
test/                 # vitest unit tests
```

## Roadmap

- [x] `list_open_prs`
- [x] `get_pr_diff` with smart truncation
- [x] `summarize_pr`
- [x] `check_pr_risk` rules
- [x] `post_review_comment`
- [x] CI on GitHub Actions
- [x] Publish to npm and the MCP Registry
- [ ] List on Smithery
- [ ] GitHub Action that reviews PRs automatically

## License

[MIT](LICENSE)
