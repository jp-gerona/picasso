// safe-path.test.ts - path resolution with trusted-root guard.
//
// Run: node --experimental-strip-types tests/safe-path.test.ts
import assert from "node:assert";
import path from "node:path";
import os from "node:os";
import { safePath } from "../lib/safe-path.ts";

const cwd = "/Users/example/projects/agent";

// Relative paths resolve under cwd.
assert.strictEqual(safePath(cwd, "data/file.xlsx"), path.resolve(cwd, "data/file.xlsx"));
assert.strictEqual(safePath(cwd, "./a.docx"), path.resolve(cwd, "a.docx"));

// Absolute path inside cwd is allowed.
assert.strictEqual(safePath(cwd, path.resolve(cwd, "sub/x.xlsx")), path.resolve(cwd, "sub/x.xlsx"));

// Absolute path under ~/Downloads is allowed even though outside cwd.
const dl = path.join(os.homedir(), "Downloads", "report.xlsx");
assert.strictEqual(safePath(cwd, dl), dl);

// Absolute path under ~/Documents is allowed.
const doc = path.join(os.homedir(), "Documents", "pi", "office", "r.md");
assert.strictEqual(safePath(cwd, doc), doc);

// Cwd-relative traversal that lands inside ~/Downloads is allowed.
const dlRel = path.join(os.homedir(), "Downloads", "x.xlsx");
const rel = path.relative(cwd, dlRel);
assert.strictEqual(safePath(cwd, rel), dlRel);

// Escape via .. to a non-trusted root is rejected.
assert.throws(() => safePath(cwd, "../../etc/passwd"), /escapes cwd/);

// Absolute path in an untrusted location (/etc) is rejected.
assert.throws(() => safePath(cwd, "/etc/passwd"), /escapes cwd/);

// A path that claims ~/Documents-something (prefix forgery) is rejected.
assert.throws(
	() => safePath(cwd, path.join(os.homedir(), "Documents-evil", "x.xlsx")),
	/escapes cwd/,
);

console.log("safe-path tests passed");
