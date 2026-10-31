import { isGeneratedFile } from "./diff.js";

export type FileType = "source" | "test" | "docs" | "config" | "asset" | "generated";

const TEST_PATTERNS = [
  /(^|\/)(test|tests|__tests__|spec)\//,
  /\.(test|spec)\.[cm]?[jt]sx?$/,
  /_test\.(go|py)$/,
  /(^|\/)test_[^/]+\.py$/,
];
const DOCS_PATTERNS = [/\.(md|mdx|rst|txt)$/i, /(^|\/)docs?\//];
const CONFIG_PATTERNS = [
  /(^|\/)\.github\//,
  /\.(json|ya?ml|toml|ini)$/,
  /(^|\/)(Dockerfile|Makefile)$/,
  /(^|\/)\.[^/]+rc(\.\w+)?$/,
];
const ASSET_PATTERN = /\.(png|jpe?g|gif|webp|ico|svg|bmp|woff2?|ttf|otf|eot|mp3|mp4|wav|webm|pdf)$/i;

// Checked in order: a lock file is "generated" even though it is also JSON.
export function fileType(path: string): FileType {
  if (isGeneratedFile(path)) return "generated";
  if (TEST_PATTERNS.some((p) => p.test(path))) return "test";
  if (DOCS_PATTERNS.some((p) => p.test(path))) return "docs";
  if (CONFIG_PATTERNS.some((p) => p.test(path))) return "config";
  if (ASSET_PATTERN.test(path)) return "asset";
  return "source";
}

// The first two directories of a path, e.g. "packages/server/src/mcp.ts" -> "packages/server".
export function areaOf(path: string): string {
  return path.split("/").slice(0, -1).slice(0, 2).join("/") || "(root)";
}
