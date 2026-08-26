# office-docs

Word and Excel CRUD + analysis tools for pi. Read modern `.xlsx`/`.docx` and
legacy `.xls`/`.doc`, analyze spreadsheets in-process, and gate writes behind a
propose-and-confirm checkpoint.

## Tools

### Spreadsheet - modern (`.xlsx`, exceljs)

| Tool | What it does |
|---|---|
| `read_xlsx` | Read an `.xlsx` sheet as markdown tables. Auto-detects two-tier headers, samples large sheets (first+last rows). |
| `analyze_xlsx` | Deterministic in-process aggregation over ALL rows: column profiles (type, missing, distinct, top values, numeric stats) and group-by (count/sum/avg/distinct) with filters. Saves a consolidated report to `~/Documents/pi/office/` and returns a digest. |
| `write_xlsx` | Create/overwrite a workbook from 2D arrays. `=`-prefixed strings become formulas. **Gated.** |
| `update_xlsx` | Update cells by reference (e.g. `A1`). Sheet created if missing. **Gated.** |

### Spreadsheet - legacy (`.xls`, SheetJS)

| Tool | What it does |
|---|---|
| `read_xls` | Read a legacy `.xls` (Excel 97-2003 / BIFF) sheet as markdown tables. Same output shape as `read_xlsx`. Read-only. |
| `analyze_xls` | Full `analyze_xlsx` pipeline on a legacy `.xls`: converts to a temp `.xlsx` internally and reuses all profiling/group-by/filter logic and the consolidated report. Read-only. |

### Word - modern (`.docx`, mammoth + docx)

| Tool | What it does |
|---|---|
| `read_docx` | Read a `.docx` file as markdown (headings, lists, tables preserved). |
| `write_docx` | Create/overwrite/append a `.docx` from markdown. **Gated.** |
| `update_docx` | Find/replace edits in a `.docx`. Returns match count. **Gated.** |

### Word - legacy (`.doc`, macOS `textutil`)

| Tool | What it does |
|---|---|
| `read_doc` | Read a legacy `.doc` (Word 97-2003 binary) as markdown via the built-in `/usr/bin/textutil` (no install). macOS-only. Read-only. |

## Legacy formats are read-only - and routed to modern on write

There are **no** `write_xls`/`update_xls`/`write_doc`/`update_doc` tools. Legacy
binary formats are not authored - they are obsolete, fragile, and inferior to
`.xlsx`/`.docx` (and to `.csv`/`.pdf` for tabular/printable output). When a
request asks to create or update a `.xls`/`.doc`, it is routed to `.xlsx`/`.docx`
instead, producing a new modern file rather than a legacy one.

## Propose-and-confirm gate (for create/update)

Every write/update tool (`write_xlsx`, `update_xlsx`, `write_docx`,
`update_docx`) is **gated**. A `tool_call` interceptor blocks the first call
for a given target path and returns an instruction requiring the agent to:

1. Propose the approach in chat: target path, output format, sheet/cell layout
   or document content, and rationale.
2. Route `.xls`/`.doc` targets to `.xlsx`/`.docx`.
3. Get an explicit user confirmation.
4. Call `confirm_write` with the same path and tool name, then retry the write.

`confirm_write` arms a **one-shot** pass for one `(tool, path)` pair. This is
enforced at the tool boundary regardless of model/session, mirroring the
brainstorming approval gate but automatic. Read tools (`read_*`, `analyze_*`)
and `confirm_write` itself are not gated.

This favors a template-free approach: a prompt template would only fire when a
human remembers to type `/propose-write`, whereas the interceptor gates every
write deterministically.

## Dependencies

- `exceljs` - `.xlsx` read/write/analyze.
- `mammoth` + `docx` - `.docx` read/write.
- `xlsx` (SheetJS) - legacy `.xls` (BIFF/OLE2) read and `.xls -> .xlsx`
  conversion for `analyze_xls`. Installed from SheetJS's pinned CDN tarball
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), not npm, because the
  npm publish (`0.18.5`) carries two known CVEs (prototype pollution + ReDoS)
  with no npm-side fix; the CDN build patches both. See
  `~/Documents/pi/repo-review/SheetJS-sheetjs.md` for the trust review.
- macOS `textutil` (built-in) - legacy `.doc` read.

## Self-test

```
node --experimental-strip-types src/selftest.ts
```

Covers `.xlsx`/`.docx` round-trips, `.xls` read + analyze, `.doc` read
(skipped on non-macOS), and the propose-and-confirm gate logic.
