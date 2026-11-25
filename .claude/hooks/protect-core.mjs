// PreToolUse hook (Claude Code: matcher Edit|Write; Cursor: preToolUse).
// Reads the tool call JSON from stdin. If the target path is inside app/src/core/,
// writes the reason to stderr and exits with code 2, which blocks the action.
// Fails closed on unreadable input: a hook that cannot tell what is being edited blocks it.
import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROTECTED = "app/src/core/";
// Repo root = two levels above this script (.claude/hooks/). Never the session cwd:
// cwd changes after `cd` (e.g. a session in app/), and then the prefix check would miss core.
// Real paths on both sides, so symlinks (macOS /tmp → /private/tmp, a symlinked checkout) cannot
// hide core behind a different spelling. A file being created does not exist yet: resolve its nearest
// existing parent and append the rest.
function real(p) {
  try {
    return realpathSync(p);
  } catch {
    const parent = dirname(p);
    return parent === p ? p : resolve(real(parent), basename(p));
  }
}
const REPO_ROOT = real(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."));

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.stderr.write("protect-core: не вдалося прочитати JSON зі stdin — дію заблоковано.\n");
  process.exit(2);
}

// Claude Code: tool_input.file_path; Cursor variants: tool_input.path / file_path at the top level.
const target = input?.tool_input?.file_path ?? input?.tool_input?.path ?? input?.file_path ?? input?.path;
if (typeof target !== "string" || target === "") process.exit(0);

// A relative target is resolved against the session cwd; the protection check is always against REPO_ROOT.
// Compared in lower case: on case-insensitive filesystems (macOS, Windows) app/src/CORE/ is the same directory
// as app/src/core/, and realpath keeps the case as typed. On Linux this blocks app/src/CORE/ too — fail closed.
const base = input?.cwd ?? process.cwd();
const realTarget = real(resolve(base, target));
const relTo = (root) => relative(root.toLowerCase(), realTarget.toLowerCase()).split(sep).join("/");

// The checkout that holds the target: the nearest parent with `.git` (a directory in the main checkout, a file in a
// git worktree, e.g. .claude/worktrees/<task>/). Its core is protected as well — the rule forbids core edits in
// worktrees and copies too. Found from the target itself, never from the session cwd.
function checkoutRoot(p) {
  for (let dir = dirname(p); ; dir = dirname(dir)) {
    if (existsSync(resolve(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return null;
  }
}
const targetRoot = checkoutRoot(realTarget);
const candidates = [relTo(REPO_ROOT), ...(targetRoot ? [relTo(targetRoot)] : [])];
const rel = candidates.find((r) => r.startsWith(PROTECTED)) ?? candidates[0];

if (rel.startsWith(PROTECTED)) {
  process.stderr.write(
    `protect-core: ${rel} — захищена зона app/src/core/** (платформна команда). ` +
      "Зміни в core — окремим PR через рев'ю платформної команди; опиши потрібну зміну замість редагування. " +
      "Див. .claude/rules/do-not-touch.md.\n",
  );
  process.exit(2);
}
process.exit(0);
