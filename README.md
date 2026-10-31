# deltaprobe 🔍

> Give your AI assistant x-ray vision into pull requests.

**deltaprobe** is a [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that lets AI assistants like Claude, Cursor and VS Code Copilot probe GitHub pull requests: list them, read their diffs, summarize changes, flag risky patches and post review comments.

> ⚠️ Early development. Tools marked 🚧 are on the roadmap.

## Tools

| Tool | Status | Description |
|---|---|---|
| `list_open_prs` | ✅ | List open PRs in a repo, most recently updated first |
| `summarize_pr` | ✅ | Overview of a PR: description, size, file types, most-touched areas, review status and CI results |
| `get_pr_diff` | ✅ | Fetch changed files and diff hunks, trimmed to whole hunks within a character budget |
| `check_pr_risk` | ✅ | Rule-based risk checks: secrets in added lines (masked), sensitive files, large diffs, missing tests, CI/migration/dependency changes, debug code |
| `post_review_comment` | 🚧 | Post the review back to GitHub |

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
- Node.js 20+
- A GitHub token ([create one](https://github.com/settings/personal-access-tokens)). Optional for public repos, but it raises the rate limit from 60 to 5,000 requests/hour.

### Use with Claude Code

```bash
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
├── diff.ts           # hunk splitting and budget fitting
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
- [ ] `post_review_comment`
- [ ] Publish to npm and the MCP Registry
- [ ] GitHub Action that reviews PRs automatically

## License

[MIT](LICENSE)
