import { describe, expect, it } from "vitest";
import { areaOf, fileType } from "../src/files.js";

describe("fileType", () => {
  it.each([
    ["src/server/mcp.ts", "source"],
    ["lib/utils.py", "source"],
    ["test/server/mcp.test.ts", "test"],
    ["src/app.spec.tsx", "test"],
    ["pkg/handler_test.go", "test"],
    ["tests/test_api.py", "test"],
    ["README.md", "docs"],
    ["docs/guide/intro.html", "docs"],
    [".github/workflows/ci.yml", "config"],
    ["tsconfig.json", "config"],
    ["Dockerfile", "config"],
    [".eslintrc.cjs", "config"],
    ["package-lock.json", "generated"],
    ["dist/index.js", "generated"],
  ])("%s is %s", (path, type) => expect(fileType(path)).toBe(type));
});

describe("areaOf", () => {
  it.each([
    ["packages/server/src/server/mcp.ts", "packages/server"],
    ["src/tools/getPrDiff.ts", "src/tools"],
    [".changeset/fix.md", ".changeset"],
    ["README.md", "(root)"],
  ])("%s is in %s", (path, area) => expect(areaOf(path)).toBe(area));
});
