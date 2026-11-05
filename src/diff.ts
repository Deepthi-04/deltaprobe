// Lock files, build output and snapshots: large diffs that nobody reviews line by line.
const GENERATED_PATTERNS = [
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)Cargo\.lock$/,
  /(^|\/)poetry\.lock$/,
  /(^|\/)go\.sum$/,
  /\.min\.(js|css)$/,
  /(^|\/)(dist|build)\//,
  /\.snap$/,
];

export function isGeneratedFile(path: string): boolean {
  return GENERATED_PATTERNS.some((pattern) => pattern.test(path));
}

// A unified diff is a series of hunks, each starting with "@@ -a,b +c,d @@".
export function splitHunks(patch: string): string[] {
  return patch.split(/\n(?=@@ )/);
}

export interface AddedLine {
  line: number;
  text: string;
}

// Returns each added line with its line number in the new version of the file.
export function addedLines(patch: string): AddedLine[] {
  const added: AddedLine[] = [];
  let line = 0;

  for (const raw of patch.split("\n")) {
    const header = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      line = Number(header[1]);
    } else if (raw.startsWith("+")) {
      added.push({ line, text: raw.slice(1) });
      line++;
    } else if (raw.startsWith(" ")) {
      line++;
    }
    // "-" lines exist only in the old file, and "\ No newline at end of file" is metadata.
  }

  return added;
}

export interface FittedPatch {
  patch: string;
  shownHunks: number;
  totalHunks: number;
}

// Keep whole hunks while they fit in the budget so the AI never sees half a hunk.
export function fitHunks(patch: string, budget: number): FittedPatch {
  const hunks = splitHunks(patch);
  const kept: string[] = [];
  let used = 0;

  for (const hunk of hunks) {
    const cost = hunk.length + (kept.length > 0 ? 1 : 0); // +1 for the joining newline
    if (used + cost > budget) break;
    kept.push(hunk);
    used += cost;
  }

  return { patch: kept.join("\n"), shownHunks: kept.length, totalHunks: hunks.length };
}

export interface CommentableLines {
  right: Set<number>; // lines in the new file: added or unchanged context
  left: Set<number>; // lines in the old file: removed or unchanged context
}

// GitHub only accepts inline review comments on lines that appear in the diff.
export function commentableLines(patch: string): CommentableLines {
  const right = new Set<number>();
  const left = new Set<number>();
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split("\n")) {
    const header = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
    } else if (raw.startsWith("+")) {
      right.add(newLine++);
    } else if (raw.startsWith("-")) {
      left.add(oldLine++);
    } else if (raw.startsWith(" ")) {
      right.add(newLine++);
      left.add(oldLine++);
    }
  }

  return { right, left };
}
