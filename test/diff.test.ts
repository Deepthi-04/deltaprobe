import { describe, expect, it } from "vitest";
import { commentableLines, fitHunks, isGeneratedFile, splitHunks } from "../src/diff.js";

const hunkA = "@@ -1,2 +1,2 @@\n-old\n+new";
const hunkB = "@@ -10,1 +10,2 @@\n context\n+added";
const patch = `${hunkA}\n${hunkB}`;

describe("isGeneratedFile", () => {
  it.each(["package-lock.json", "web/yarn.lock", "go.sum", "app.min.js", "dist/index.js", "a/__snapshots__/x.snap"])(
    "flags %s",
    (path) => expect(isGeneratedFile(path)).toBe(true),
  );

  it.each(["src/index.ts", "README.md", "lock.ts", "distance.ts"])("does not flag %s", (path) =>
    expect(isGeneratedFile(path)).toBe(false),
  );
});

describe("splitHunks", () => {
  it("splits a patch into hunks, keeping each @@ header", () => {
    expect(splitHunks(patch)).toEqual([hunkA, hunkB]);
  });

  it("does not split on @@ that appears mid-line", () => {
    const tricky = "@@ -1 +1 @@\n+const s = '@@ not a hunk';";
    expect(splitHunks(tricky)).toEqual([tricky]);
  });
});

describe("fitHunks", () => {
  it("keeps the whole patch when it fits", () => {
    expect(fitHunks(patch, 1_000)).toEqual({ patch, shownHunks: 2, totalHunks: 2 });
  });

  it("drops whole hunks instead of cutting one in half", () => {
    expect(fitHunks(patch, hunkA.length + 5)).toEqual({ patch: hunkA, shownHunks: 1, totalHunks: 2 });
  });

  it("returns nothing when even the first hunk does not fit", () => {
    expect(fitHunks(patch, 3)).toEqual({ patch: "", shownHunks: 0, totalHunks: 2 });
  });
});

describe("commentableLines", () => {
  it("maps added, removed and context lines to the right side of the diff", () => {
    const patch = ["@@ -10,3 +10,4 @@", " a", "-b", "+B", "+C", " d", "@@ -50,1 +51,1 @@", "-x", "+y"].join("\n");

    const { right, left } = commentableLines(patch);

    expect([...right]).toEqual([10, 11, 12, 13, 51]);
    expect([...left]).toEqual([10, 11, 12, 50]);
  });
});
