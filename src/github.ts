import { Octokit } from "@octokit/rest";

// Reads the token from the environment so it never lives in source code.
// Without a token, public repos still work but GitHub limits you to 60 requests/hour.
export function createGitHubClient(token = process.env.GITHUB_TOKEN): Octokit {
  return new Octokit({ auth: token, userAgent: "deltaprobe" });
}
