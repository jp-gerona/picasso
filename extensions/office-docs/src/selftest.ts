import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readXlsx,
  analyzeXlsx,
  writeXlsx,
  updateXlsx,
} from "./xlsx.ts";
import {
  readDocx,
  writeDocx,
  updateDocx,
} from "./docx.ts";

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
ok("analyze_xlsx returns digest with saved path", /saved to/.test(profile) && !profile.includes("| Column |"));
const savedReport = readFileSync(profile.match(/saved to (\S+)/)?.[1] ?? "missing", "utf8");
ok("analyze_xlsx saved report has column stats", savedReport.includes("Distinct") && savedReport.includes("categorical"));
ok("analyze_xlsx report is self-contained", savedReport.includes("How to read this") && savedReport.includes(xlsxPath));

const grouped = await analyzeXlsx(cwd, {
  path: xlsxPath,
  sheet: "Data",
  groupBy: "Name",
  agg: "count",
});
const groupedPath = grouped.match(/saved to (\S+)/)?.[1] ?? "missing";
const groupedReport = readFileSync(groupedPath, "utf8");
ok("analyze_xlsx groupBy count works", groupedReport.includes("Alice") && groupedReport.includes("| 1 |"));

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

console.log(`\n=== Selftest complete: ${pass} passed, ${fail} failed ===`);
if (fail > 0) process.exit(1);
