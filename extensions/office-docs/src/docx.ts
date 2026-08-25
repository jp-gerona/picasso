import mammoth from "mammoth";
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from "docx";
import { writeFileSync, readFileSync } from "node:fs";
import { Type } from "typebox";
import { safePath } from "../../../lib/safe-path.ts";

/** Parse a markdown string into docx block elements (paragraphs, headings, tables). */
function mdToBlocks(md: string): (Paragraph | Table)[] {
  const lines = md.split("\n");
  const blocks: (Paragraph | Table)[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Table block: a header row followed by a separator row.
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1])) {
      const tableRows: string[][] = [];
      // Header
      tableRows.push(parseTableRow(line));
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        tableRows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push(mdTableToDocx(tableRows));
      continue;
    }

    // Headings.
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      const heading =
        level === 1
          ? HeadingLevel.HEADING_1
          : level === 2
            ? HeadingLevel.HEADING_2
            : level === 3
              ? HeadingLevel.HEADING_3
              : level === 4
                ? HeadingLevel.HEADING_4
                : level === 5
                  ? HeadingLevel.HEADING_5
                  : HeadingLevel.HEADING_6;
      blocks.push(new Paragraph({ heading, children: [new TextRun(text)] }));
      i++;
      continue;
    }

    // Unordered list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, "").trim());
        i++;
      }
      blocks.push(...items.map((t) => new Paragraph({ bullet: { level: 0 }, children: parseInline(t) })));
      continue;
    }

    // Ordered list.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, "").trim());
        i++;
      }
      blocks.push(
        ...items.map((t) => new Paragraph({ numbering: { reference: "default-numbering", level: 0 }, children: parseInline(t) })),
      );
      continue;
    }

    // Blank line.
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (consume consecutive non-empty, non-special lines).
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(new Paragraph({ children: parseInline(paraLines.join(" ").trim()) }));
  }
  return blocks;
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((c) => c.trim().replace(/\\\|/g, "|"));
}

function mdTableToDocx(rows: string[][]): Table {
  const tableRows = rows.map(
    (cells, r) =>
      new TableRow({
        tableHeader: r === 0,
        children: cells.map(
          (c) =>
            new TableCell({
              children: [new Paragraph({ children: parseInline(c) })],
            }),
        ),
      }),
  );
  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/** Parse inline markdown (bold, italic, code) into TextRuns. */
function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  // Tokenize **bold**, *italic*, `code`.
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(new TextRun(text.slice(last, m.index)));
    if (m[2] !== undefined) runs.push(new TextRun({ text: m[2], bold: true }));
    else if (m[3] !== undefined) runs.push(new TextRun({ text: m[3], italics: true }));
    else if (m[4] !== undefined) runs.push(new TextRun({ text: m[4], font: "Courier New" }));
    last = re.lastIndex;
  }
  if (last < text.length) runs.push(new TextRun(text.slice(last)));
  return runs.length ? runs : [new TextRun(text)];
}

export async function readDocx(cwd: string, params: { path: string }): Promise<string> {
  const abs = safePath(cwd, params.path);
  const buf = readFileSync(abs);
  const result = await mammoth.convertToMarkdown({ buffer: buf });
  return result.value;
}

export async function writeDocx(
  cwd: string,
  params: { path: string; content: string; mode?: "overwrite" | "append" },
): Promise<string> {
  const abs = safePath(cwd, params.path);
  const mode = params.mode ?? "overwrite";

  let body: (Paragraph | Table)[] = mdToBlocks(params.content);

  if (mode === "append") {
    try {
      const existing = await mammoth.convertToMarkdown({ buffer: readFileSync(abs) });
      body = [...mdToBlocks(existing.value), new Paragraph({ children: [] }), ...body];
    } catch {
      // File doesn't exist; treat as overwrite.
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children: body }],
  });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(abs, buf);
  return `Wrote ${params.content.length} chars to ${params.path} (${mode})`;
}

export async function updateDocx(
  cwd: string,
  params: { path: string; edits: { find: string; replace: string }[] },
): Promise<string> {
  const abs = safePath(cwd, params.path);
  // Round-trip through markdown: read, replace, write.
  const existing = await mammoth.convertToMarkdown({ buffer: readFileSync(abs) });
  let md = existing.value;
  let made = 0;
  for (const e of params.edits) {
    const before = md;
    md = md.split(e.find).join(e.replace);
    if (md !== before) made++;
  }
  const body = mdToBlocks(md);
  const doc = new Document({
    sections: [{ properties: {}, children: body }],
  });
  const buf = await Packer.toBuffer(doc);
  writeFileSync(abs, buf);
  return `Applied ${made}/${params.edits.length} edits to ${params.path}`;
}

// --- Schemas ----------------------------------------------------------------

export const readDocxSchema = Type.Object({
  path: Type.String({ description: "Path to .docx file." }),
});
export const writeDocxSchema = Type.Object({
  path: Type.String({ description: "Path to write." }),
  content: Type.String({ description: "Markdown content to convert into the Word document." }),
  mode: Type.Optional(
    Type.Union([Type.Literal("overwrite"), Type.Literal("append")], {
      description: "overwrite (default) or append to existing document.",
    }),
  ),
});

export const updateDocxSchema = Type.Object({
  path: Type.String({ description: "Path to existing .docx file." }),
  edits: Type.Array(
    Type.Object({
      find: Type.String({ description: "Exact text to find." }),
      replace: Type.String({ description: "Replacement text." }),
    }),
  ),
});
