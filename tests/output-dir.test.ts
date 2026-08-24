// output-dir.test.ts - artifact output root resolution and collision-safe
// artifact saving.
//
// Run: node --experimental-strip-types tests/output-dir.test.ts
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveOutputRoot, saveArtifact } from "../extensions/output-dir.ts";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "output-dir-test-"));

// PI_OUTPUT_DIR override wins over everything, resolved to an absolute path.
assert.strictEqual(
	resolveOutputRoot("/home/x", { PI_OUTPUT_DIR: "rel/out" }),
	path.resolve("rel/out"),
	"PI_OUTPUT_DIR override is honored and absolutized",
);

// Documents present -> ~/Documents/pi.
const withDocs = path.join(tmp, "docs-home");
fs.mkdirSync(path.join(withDocs, "Documents"), { recursive: true });
assert.strictEqual(
	resolveOutputRoot(withDocs, {}),
	path.join(withDocs, "Documents", "pi"),
	"Documents home resolves to ~/Documents/pi",
);

// No Documents -> ~/.pi/output fallback.
const noDocs = path.join(tmp, "nodoc-home");
assert.strictEqual(
	resolveOutputRoot(noDocs, {}),
	path.join(noDocs, ".pi", "output"),
	"missing Documents falls back to ~/.pi/output",
);

// saveArtifact creates subdirectories and writes content.
const root = path.join(tmp, "artifacts");
const p1 = saveArtifact(root, "office", "report", "# hello\n");
assert.strictEqual(fs.readFileSync(p1, "utf8"), "# hello\n", "artifact content written");
assert.ok(p1.includes(path.join("office", "report.md")), "lands under subdir with .md");

// Same base name again does not overwrite; it produces a distinct file.
const p2 = saveArtifact(root, "office", "report", "# second\n");
assert.notStrictEqual(p1, p2, "collision produces a distinct filename");
assert.strictEqual(fs.readFileSync(p1, "utf8"), "# hello\n", "original artifact untouched");
assert.strictEqual(fs.readFileSync(p2, "utf8"), "# second\n", "new artifact written alongside");

// Custom extension passes through.
const csv = saveArtifact(root, "office", "data", "a,b\n", ".csv");
assert.ok(csv.endsWith(".csv"), "custom extension respected");

console.log("output-dir tests passed");
