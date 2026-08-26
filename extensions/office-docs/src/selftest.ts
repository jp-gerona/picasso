import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readXlsx,
  analyzeXlsx,
  writeXlsx,
  updateXlsx,
} from "./xlsx.ts";
import {
  readXls,
  analyzeXls,
} from "./xls.ts";
import {
  readDocx,
  writeDocx,
  updateDocx,
} from "./docx.ts";
import { readDoc } from "./doc.ts";
import { gateDecision, gateKey, WRITE_TOOLS } from "./gate.ts";

const cwd = mkdtempSync(join(tmpdir(), "office-docs-selftest-"));
// Route analysis artifacts to a throwaway root so the selftest never
// writes into ~/Documents.
process.env.PI_OUTPUT_DIR = join(cwd, "out");
let pass = 0;
let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) {
    pass++;
    console.log(`  PASS: ${name}`);
  } else {
    fail++;
    console.log(`  FAIL: ${name} ${extra}`);
  }
};

console.log("\n=== XLSX round-trip ===");
const xlsxPath = "test.xlsx";
await writeXlsx(cwd, {
  path: xlsxPath,
  sheets: [
    {
      name: "Data",
      rows: [
        ["Name", "Age", "Score"],
        ["Alice", 30, "=SUM(B2:B3)"],
        ["Bob", 25, 90],
      ],
    },
  ],
});
ok("write_xlsx creates file", readFileSync(join(cwd, xlsxPath)).length > 0);

const readBack = await readXlsx(cwd, { path: xlsxPath, formulas: true });
ok("read_xlsx returns headers", readBack.includes("Name") && readBack.includes("Age"));
ok("read_xlsx returns data", readBack.includes("Alice") && readBack.includes("Bob"));
ok("read_xlsx shows formula when requested", readBack.includes("[=SUM"));

await updateXlsx(cwd, { path: xlsxPath, sheet: "Data", updates: { cell: "A4", value: "Carol" } });
const afterUpdate = await readXlsx(cwd, { path: xlsxPath, maxRows: "all" });
ok("update_xlsx writes new cell", afterUpdate.includes("Carol"));

const profile = await analyzeXlsx(cwd, { path: xlsxPath, sheet: "Data", profile: true });
ok("analyze_xlsx digest says saved (first call)", /Report saved to /.test(profile));
ok("analyze_xlsx digest stays compact", !profile.includes("| Column |"));
const profilePath = profile.match(/saved to (\S+\.md)/)?.[1] ?? "missing";
const savedReport = readFileSync(profilePath, "utf8");
ok("analyze_xlsx saved report has column stats", savedReport.includes("Distinct") && savedReport.includes("categorical"));
ok("analyze_xlsx report is self-contained", savedReport.includes("How to read this") && savedReport.includes(xlsxPath));

const grouped = await analyzeXlsx(cwd, {
  path: xlsxPath,
  sheet: "Data",
  groupBy: "Name",
  agg: "count",
});
ok("analyze_xlsx digest says appended (second call)", /Report appended to /.test(grouped));
const groupedPath = grouped.match(/appended to (\S+\.md)/)?.[1] ?? "missing";
ok("analyze_xlsx consolidates calls into one file", groupedPath === profilePath,
	`expected ${profilePath}, got ${groupedPath}`);
const groupedReport = readFileSync(groupedPath, "utf8");
ok("analyze_xlsx groupBy count works", groupedReport.includes("Alice") && groupedReport.includes("| 1 |"));
ok("consolidated report retains the profile section", groupedReport.includes("Distinct") && groupedReport.includes("categorical"));
ok("consolidated report header is not repeated", (groupedReport.match(/^# Analysis:/gm) || []).length === 1);

const matched = await analyzeXlsx(cwd, {
  path: xlsxPath,
  sheet: "Data",
  groupBy: "Name",
  agg: "count",
  filter: [{ column: "Name", op: "match", value: "^A" }],
});
ok("analyze_xlsx match filter narrows rows", /1 after filter/.test(matched));

console.log("\n=== DOCX round-trip ===");
const docxPath = "test.docx";
const md = `# Test Heading

This is a **bold** and *italic* paragraph with \`code\`.

- Bullet one
- Bullet two

1. First
2. Second

| Col A | Col B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |
`;
await writeDocx(cwd, { path: docxPath, content: md });
ok("write_docx creates file", readFileSync(join(cwd, docxPath)).length > 0);

const docRead = await readDocx(cwd, { path: docxPath });
ok("read_docx returns heading", /Test Heading/.test(docRead));
ok("read_docx returns bold text", /bold/.test(docRead));
ok("read_docx returns table content", /Col A/.test(docRead));

await updateDocx(cwd, { path: docxPath, edits: [{ find: "bold", replace: "BOLD" }] });
const afterDocEdit = await readDocx(cwd, { path: docxPath });
ok("update_docx applies find/replace", /BOLD/.test(afterDocEdit) && !/\bbold\b/.test(afterDocEdit));

console.log("\n=== Legacy .xls read (SheetJS) ===");
// Write a .xls via SheetJS, then read it back through read_xls so the legacy
// path is exercised against a real BIFF file, not just an .xlsx.
const xlsPath = "legacy.xls";
await (async () => {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["Name", "Age", "Score"],
    ["Alice", 30, 90],
    ["Bob", 25, 80],
    ["Carol", 41, 70],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, "Data");
  const xlsBuf = XLSX.write(wb, { bookType: "biff8", type: "buffer" });
  writeFileSync(join(cwd, xlsPath), xlsBuf);
})();
ok("wrote .xls test fixture", readFileSync(join(cwd, xlsPath)).length > 0);

const xlsRead = await readXls(cwd, { path: xlsPath, maxRows: "all" });
ok("read_xls returns headers", xlsRead.includes("Name") && xlsRead.includes("Age"));
ok("read_xls returns data", xlsRead.includes("Alice") && xlsRead.includes("Carol"));
ok("read_xls markdown table shape", /\| Name \| Age \|/.test(xlsRead) && /\| --- \|/.test(xlsRead));

const xlsProfile = await analyzeXls(cwd, { path: xlsPath, sheet: "Data", profile: true });
ok("analyze_xls digest says saved", /Report saved to /.test(xlsProfile));
ok("analyze_xls digest stays compact", !xlsProfile.includes("| Column |"));
const xlsProfilePath = xlsProfile.match(/saved to (\S+\.md)/)?.[1] ?? "missing";
const xlsReport = readFileSync(xlsProfilePath, "utf8");
ok("analyze_xls report has column stats", xlsReport.includes("Distinct") && xlsReport.includes("categorical"));
ok("analyze_xls report is self-contained", xlsReport.includes("How to read this"));

const xlsGrouped = await analyzeXls(cwd, { path: xlsPath, sheet: "Data", groupBy: "Name", agg: "count" });
ok("analyze_xls groupBy works", /Report appended to /.test(xlsGrouped));
ok("analyze_xls groupBy shows keys", readFileSync(xlsGrouped.match(/appended to (\S+\.md)/)?.[1] ?? "missing", "utf8").includes("Alice"));

console.log("\n=== Legacy .doc read (textutil) ===");
// Skip the .doc block gracefully if textutil is absent (non-macOS CI).
const hasTextutil = existsSync("/usr/bin/textutil");
if (hasTextutil) {
  // Write a .doc via textutil from html, then read it back through read_doc.
  const docPath = "legacy.doc";
  const htmlPath = join(cwd, "src.html");
  writeFileSync(htmlPath, "<html><body><h1>Legacy Title</h1><p>Bold <b>word</b> here.</p><ul><li>one</li><li>two</li></ul></body></html>");
  execFileSync("textutil", ["-convert", "doc", "-output", join(cwd, docPath), htmlPath]);
  ok("wrote .doc test fixture", readFileSync(join(cwd, docPath)).length > 0);
  const docRead = await readDoc(cwd, { path: docPath });
  ok("read_doc returns heading", /Legacy Title/.test(docRead));
  ok("read_doc returns bold text", /word/.test(docRead));
  ok("read_doc returns list items", /one/.test(docRead) && /two/.test(docRead));
} else {
  console.log("  SKIP: textutil unavailable (non-macOS)");
}

console.log("\n=== Propose-and-confirm gate ===");
const gateCwd = cwd;
const armed = new Set<string>();
ok("gate blocks ungated write_xlsx", gateDecision("write_xlsx", gateKey(gateCwd, "write_xlsx", "out.xlsx"), armed).block === true);
ok("gate ignores non-write tools", gateDecision("read_xlsx", "read_xlsx:x", armed).block === false);
ok("gate ignores unknown tools", gateDecision("bash", undefined, armed).block === false);
const gateKeyStr = gateKey(gateCwd, "write_xlsx", "out.xlsx")!;
armed.add(gateKeyStr);
const allowVerdict = gateDecision("write_xlsx", gateKeyStr, armed);
ok("gate allows after arming", allowVerdict.block === false);
ok("gate is one-shot", gateDecision("write_xlsx", gateKeyStr, armed).block === true);
ok("gate reason names the tool", (gateDecision("write_docx", gateKey(gateCwd, "write_docx", "out.docx"), new Set()).reason ?? "").includes("write_docx"));
ok("WRITE_TOOLS covers all four", WRITE_TOOLS.length === 4 && ["write_xlsx","update_xlsx","write_docx","update_docx"].every((t) => (WRITE_TOOLS as readonly string[]).includes(t)));

console.log(`\n=== Selftest complete: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
