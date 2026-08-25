// output-dir.test.ts - artifact output root resolution and collision-safe
// artifact saving.
//
// Run: node --experimental-strip-types tests/output-dir.test.ts
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveOutputRoot, saveArtifact, appendArtifact } from "../lib/output-dir.ts";

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

// appendArtifact writes header+section on first call.
const first = appendArtifact(root, "office", "wb-analysis", "## Section A", "# Workbook Report\n\nIntro.");
assert.ok(first.path.endsWith("wb-analysis.md"), "first write lands at base name");
assert.strictEqual(first.created, true, "first call reports created=true");
const firstContent = fs.readFileSync(first.path, "utf8");
assert.ok(firstContent.startsWith("# Workbook Report"), "header written on first call");
assert.ok(firstContent.includes("## Section A"), "section written on first call");

// Second call with same key appends a section instead of a new file.
const second = appendArtifact(root, "office", "wb-analysis", "## Section B", "# Workbook Report\n\nIntro.");
assert.strictEqual(second.path, first.path, "second call reuses the same file");
assert.strictEqual(second.created, false, "second call reports created=false");
const secondContent = fs.readFileSync(first.path, "utf8");
assert.ok(secondContent.includes("## Section A") && secondContent.includes("## Section B"),
	"appended section coexists with the original");
assert.strictEqual(
	secondContent.match(/# Workbook Report/g)!.length, 1,
	"header is not repeated on append",
);
assert.ok(secondContent.indexOf("## Section A") < secondContent.indexOf("## Section B"),
	"sections preserve call order");

console.log("output-dir tests passed");
