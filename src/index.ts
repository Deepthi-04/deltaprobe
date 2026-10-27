#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createGitHubClient } from "./github.js";
import { listOpenPrs, listOpenPrsInput } from "./tools/listOpenPrs.js";

const server = new McpServer({ name: "deltaprobe", version: "0.1.0" });
const octokit = createGitHubClient();

server.registerTool(
  "list_open_prs",
  {
    title: "List open pull requests",
    description:
      "List open pull requests in a GitHub repository, most recently updated first. " +
      "Use this to find which PR to review.",
    inputSchema: listOpenPrsInput,
  },
  async (args) => {
    const prs = await listOpenPrs(octokit, args);
    return { content: [{ type: "text", text: JSON.stringify(prs, null, 2) }] };
  },
);

// stdout carries MCP protocol messages, so logs must go to stderr.
await server.connect(new StdioServerTransport());
console.error("deltaprobe MCP server running on stdio");
