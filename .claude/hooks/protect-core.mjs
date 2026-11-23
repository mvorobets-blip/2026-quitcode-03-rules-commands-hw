// PreToolUse hook (Claude Code: matcher Edit|Write; Cursor: preToolUse).
// Reads the tool call JSON from stdin. If the target path is inside app/src/core/,
// writes the reason to stderr and exits with code 2, which blocks the action.
// Fails closed on unreadable input: a hook that cannot tell what is being edited blocks it.
import { relative, resolve, sep } from "node:path";

const PROTECTED = "app/src/core/";

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

const root = input?.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = relative(root, resolve(root, target)).split(sep).join("/");

if (rel.startsWith(PROTECTED)) {
  process.stderr.write(
    `protect-core: ${rel} — захищена зона app/src/core/** (платформна команда). ` +
      "Зміни в core — окремим PR через рев'ю платформної команди; опиши потрібну зміну замість редагування. " +
      "Див. .claude/rules/do-not-touch.md.\n",
  );
  process.exit(2);
}
process.exit(0);
