import { describe, expect, it } from "vitest";
import { addedLines } from "../src/diff.js";
import {
  assessRisk,
  ciConfig,
  debugCode,
  dependencies,
  largePr,
  mask,
  migration,
  noTests,
  secretInDiff,
  sensitiveFile,
  type RiskFile,
} from "../src/risk/rules.js";

// Fake secrets are built at runtime so GitHub's push protection doesn't flag this file.
const fakeGitHubToken = "ghp_" + "a1B2".repeat(9);
const fakeAwsKey = "AKIA" + "ABCDEFGHIJKLMNOP";

function file(path: string, extra: Partial<RiskFile> = {}): RiskFile {
  return { path, status: "modified", additions: 1, deletions: 0, ...extra };
}

describe("addedLines", () => {
  it("numbers added lines by their position in the new file", () => {
    const patch = "@@ -10,3 +20,4 @@\n context\n-removed\n+added one\n context\n+added two";
    expect(addedLines(patch)).toEqual([
      { line: 21, text: "added one" },
      { line: 23, text: "added two" },
    ]);
  });

  it("restarts numbering at each hunk and ignores no-newline markers", () => {
    const patch = "@@ -1 +1 @@\n+a\n\\ No newline at end of file\n@@ -50,0 +51,1 @@\n+b";
    expect(addedLines(patch)).toEqual([
      { line: 1, text: "a" },
      { line: 51, text: "b" },
    ]);
  });
});

describe("mask", () => {
  it("shows only the first 4 characters and the length", () => {
    expect(mask(fakeGitHubToken)).toBe("ghp_…(40 chars)");
  });
});

describe("secretInDiff", () => {
  it("flags secrets on added lines with file, line and a masked value", () => {
    const patch = `@@ -1 +1,3 @@\n const a = 1;\n+const token = "${fakeGitHubToken}";\n+const aws = "${fakeAwsKey}";`;

    const findings = secretInDiff([file("src/config.ts", { patch })]);

    expect(findings).toEqual([
      expect.objectContaining({ severity: "high", file: "src/config.ts", line: 2 }),
      expect.objectContaining({ file: "src/config.ts", line: 3 }),
    ]);
    expect(findings[0].message).toContain("GitHub token");
    expect(JSON.stringify(findings)).not.toContain(fakeGitHubToken);
  });

  it("flags hardcoded credentials and private keys", () => {
    const patch = '@@ -0,0 +1,2 @@\n+password = "hunter2hunter2"\n+-----BEGIN RSA PRIVATE KEY-----';

    const messages = secretInDiff([file("app.py", { patch })]).map((f) => f.message);

    expect(messages[0]).toContain("hardcoded credential");
    expect(messages[1]).toContain("private key");
  });

  it("ignores removed lines and short or env-based values", () => {
    const patch = `@@ -1,2 +1,2 @@\n-const token = "${fakeGitHubToken}";\n+const token = process.env.TOKEN;\n+password = "x"`;

    expect(secretInDiff([file("src/a.ts", { patch })])).toEqual([]);
  });

  it("caps findings and says how many were hidden", () => {
    const lines = Array.from({ length: 12 }, () => `+key = "${fakeAwsKey}"`).join("\n");

    const findings = secretInDiff([file("src/keys.ts", { patch: `@@ -0,0 +1,12 @@\n${lines}` })]);

    expect(findings).toHaveLength(11);
    expect(findings[10].message).toBe("…and 2 more secret_in_diff findings not shown");
  });
});

describe("sensitiveFile", () => {
  it("flags env files and keys but not templates or deletions", () => {
    const findings = sensitiveFile([
      file(".env"),
      file("config/.env.production"),
      file("certs/server.pem"),
      file(".env.example"),
      file("old.key", { status: "removed" }),
      file("src/environment.ts"),
    ]);

    expect(findings.map((f) => f.file)).toEqual([".env", "config/.env.production", "certs/server.pem"]);
  });
});

describe("largePr", () => {
  it("ignores generated files when counting lines", () => {
    expect(largePr([file("package-lock.json", { additions: 5_000 }), file("src/a.ts", { additions: 100 })])).toEqual([]);
  });

  it("is medium above 500 lines and high above 1000", () => {
    expect(largePr([file("src/a.ts", { additions: 400, deletions: 200 })])[0].severity).toBe("medium");
    expect(largePr([file("src/a.ts", { additions: 900, deletions: 200 })])[0].severity).toBe("high");
  });
});

describe("noTests", () => {
  it("flags source changes without test changes", () => {
    expect(noTests([file("src/a.ts"), file("README.md")])).toEqual([
      expect.objectContaining({ rule: "no_tests", message: "1 source file(s) changed but no test files were touched" }),
    ]);
  });

  it("is quiet when tests changed or no source changed", () => {
    expect(noTests([file("src/a.ts"), file("test/a.test.ts")])).toEqual([]);
    expect(noTests([file("README.md"), file("src/old.ts", { status: "removed" })])).toEqual([]);
  });
});

describe("path rules", () => {
  it("flags CI, migration and dependency changes", () => {
    const files = [
      file(".github/workflows/release.yml"),
      file("db/migrations/001_users.sql"),
      file("package.json"),
      file("services/api/requirements.txt"),
      file("src/a.ts"),
    ];

    expect(ciConfig(files).map((f) => f.file)).toEqual([".github/workflows/release.yml"]);
    expect(migration(files).map((f) => f.file)).toEqual(["db/migrations/001_users.sql"]);
    expect(dependencies(files).map((f) => f.file)).toEqual(["package.json", "services/api/requirements.txt"]);
  });
});

describe("debugCode", () => {
  it("flags debug statements in source files only", () => {
    const patch = "@@ -0,0 +1,3 @@\n+console.log(user);\n+debugger;\n+const ok = 1;";

    const findings = debugCode([file("src/a.ts", { patch }), file("test/a.test.ts", { patch })]);

    expect(findings.map((f) => [f.file, f.line])).toEqual([
      ["src/a.ts", 1],
      ["src/a.ts", 2],
    ]);
  });

  it("ignores example and script code, where printing is intentional", () => {
    const patch = "@@ -0,0 +1 @@\n+console.log(result);";

    expect(debugCode([file("examples/client.ts", { patch }), file("scripts/release.ts", { patch })])).toEqual([]);
  });
});

describe("assessRisk", () => {
  it("sorts findings by severity and uses the worst as the level", () => {
    const { level, findings } = assessRisk([file("src/a.ts"), file("package.json"), file(".env")]);

    expect(level).toBe("high");
    expect(findings.map((f) => f.severity)).toEqual(["high", "medium", "low"]);
  });

  it("is none for a clean PR", () => {
    expect(assessRisk([file("src/a.ts"), file("test/a.test.ts")])).toEqual({ level: "none", findings: [] });
  });
});
