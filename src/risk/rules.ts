import { addedLines, isGeneratedFile } from "../diff.js";
import { fileType } from "../files.js";

export type Severity = "low" | "medium" | "high";

export interface RiskFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
}

// A rule looks at the PR's files and returns zero or more findings.
export type Rule = (files: RiskFile[]) => Finding[];

const LARGE_PR_LINES = 500;
const HUGE_PR_LINES = 1_000;
const MAX_FINDINGS_PER_RULE = 10;

const SEVERITY_ORDER: Record<Severity, number> = { low: 1, medium: 2, high: 3 };

const SECRET_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/ },
  { name: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    name: "hardcoded credential",
    pattern: /\b(?:api[_-]?key|secret|password|passwd|token)\b["']?\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
];

const SENSITIVE_FILE_PATTERNS = [
  /(^|\/)\.env(\.|$)/,
  /\.(pem|key|p12|pfx)$/,
  /(^|\/)id_(rsa|ecdsa|ed25519)$/,
  /(^|\/)credentials(\.\w+)?$/,
  /(^|\/)\.npmrc$/,
];
const SAFE_ENV_TEMPLATE = /(^|\/)\.env\.(example|sample|template)$/;

const CI_PATTERNS = [/(^|\/)\.github\/workflows\//, /(^|\/)\.gitlab-ci\.yml$/, /(^|\/)\.circleci\//];
const MIGRATION_PATTERNS = [/(^|\/)migrations?\//, /\.sql$/];
const MANIFEST_PATTERN =
  /(^|\/)(package\.json|requirements[^/]*\.txt|pyproject\.toml|go\.mod|Cargo\.toml|Gemfile|pom\.xml|build\.gradle(\.kts)?)$/;
const DEBUG_PATTERN = /\bconsole\.log\(|\bdebugger\b|\bpdb\.set_trace\(\)|\bbinding\.pry\b/;
// Printing is the point of example and script code, so console.log there is not a leftover.
const PRINTS_ON_PURPOSE = /(^|\/)(examples?|scripts|demos?|bin)\//;

const matchesAny = (path: string, patterns: RegExp[]) => patterns.some((p) => p.test(path));
const isLive = (f: RiskFile) => f.status !== "removed";

// Show just enough of a secret to recognize it, so the finding doesn't leak it again.
export function mask(secret: string): string {
  return `${secret.slice(0, 4)}…(${secret.length} chars)`;
}

function limit(rule: string, findings: Finding[]): Finding[] {
  if (findings.length <= MAX_FINDINGS_PER_RULE) return findings;
  const hidden = findings.length - MAX_FINDINGS_PER_RULE;
  return [
    ...findings.slice(0, MAX_FINDINGS_PER_RULE),
    { rule, severity: findings[0].severity, message: `…and ${hidden} more ${rule} findings not shown` },
  ];
}

export const secretInDiff: Rule = (files) => {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!file.patch || isGeneratedFile(file.path)) continue;
    for (const { line, text } of addedLines(file.patch)) {
      for (const { name, pattern } of SECRET_PATTERNS) {
        const match = text.match(pattern);
        if (match) {
          findings.push({
            rule: "secret_in_diff",
            severity: "high",
            message: `Possible ${name} added: ${mask(match[0])}`,
            file: file.path,
            line,
          });
          break; // one finding per line is enough
        }
      }
    }
  }
  return limit("secret_in_diff", findings);
};

export const sensitiveFile: Rule = (files) =>
  files
    .filter((f) => isLive(f) && matchesAny(f.path, SENSITIVE_FILE_PATTERNS) && !SAFE_ENV_TEMPLATE.test(f.path))
    .map((f) => ({
      rule: "sensitive_file",
      severity: "high",
      message: "Sensitive file added or changed; secrets and keys should not be committed",
      file: f.path,
    }));

export const largePr: Rule = (files) => {
  const lines = files
    .filter((f) => !isGeneratedFile(f.path))
    .reduce((sum, f) => sum + f.additions + f.deletions, 0);
  if (lines <= LARGE_PR_LINES) return [];
  return [
    {
      rule: "large_pr",
      severity: lines > HUGE_PR_LINES ? "high" : "medium",
      message: `${lines} lines changed (excluding generated files); large PRs are hard to review thoroughly`,
    },
  ];
};

export const noTests: Rule = (files) => {
  const source = files.filter((f) => isLive(f) && fileType(f.path) === "source");
  const touchesTests = files.some((f) => fileType(f.path) === "test");
  if (source.length === 0 || touchesTests) return [];
  return [
    {
      rule: "no_tests",
      severity: "medium",
      message: `${source.length} source file(s) changed but no test files were touched`,
    },
  ];
};

export const ciConfig: Rule = (files) =>
  files
    .filter((f) => matchesAny(f.path, CI_PATTERNS))
    .map((f) => ({
      rule: "ci_config",
      severity: "medium",
      message: "CI workflow changed; check permissions, secret usage and third-party actions",
      file: f.path,
    }));

export const migration: Rule = (files) =>
  files
    .filter((f) => isLive(f) && matchesAny(f.path, MIGRATION_PATTERNS))
    .map((f) => ({
      rule: "migration",
      severity: "medium",
      message: "Database migration changed; check it is reversible and safe on large tables",
      file: f.path,
    }));

export const dependencies: Rule = (files) =>
  files
    .filter((f) => MANIFEST_PATTERN.test(f.path))
    .map((f) => ({
      rule: "dependencies",
      severity: "low",
      message: "Dependency manifest changed; verify new or upgraded packages",
      file: f.path,
    }));

export const debugCode: Rule = (files) => {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!file.patch || fileType(file.path) !== "source" || PRINTS_ON_PURPOSE.test(file.path)) continue;
    for (const { line, text } of addedLines(file.patch)) {
      if (DEBUG_PATTERN.test(text)) {
        findings.push({
          rule: "debug_code",
          severity: "low",
          message: `Debug statement added: ${text.trim().slice(0, 80)}`,
          file: file.path,
          line,
        });
      }
    }
  }
  return limit("debug_code", findings);
};

export const RULES: Rule[] = [
  secretInDiff,
  sensitiveFile,
  largePr,
  noTests,
  ciConfig,
  migration,
  dependencies,
  debugCode,
];

export interface RiskAssessment {
  level: Severity | "none";
  findings: Finding[];
}

// Runs every rule; the PR's level is its most severe finding.
export function assessRisk(files: RiskFile[], rules: Rule[] = RULES): RiskAssessment {
  const findings = rules
    .flatMap((rule) => rule(files))
    .sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  return { level: findings[0]?.severity ?? "none", findings };
}
