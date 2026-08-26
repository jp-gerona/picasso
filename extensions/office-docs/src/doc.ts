/**
 * Legacy .doc (Word 97-2003 binary) reader. No robust pure-JS parser exists;
 * macOS ships `textutil` which converts .doc -> html natively. We shell out
 * to it (no install), then reduce the html to markdown.
 *
 * Platform: macOS only (textutil is /usr/bin/textutil). On other platforms
 * the tool returns a clear error pointing at the missing binary.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import { safePath } from "../../../lib/safe-path.ts";

/** Convert .doc -> html via textutil. Returns html text. */
function docToHtml(abs: string): string {
  const out = join(tmpdir(), `office-docs-doc-${process.pid}-${Date.now()}.html`);
  try {
    execFileSync("textutil", ["-convert", "html", "-encoding", "UTF-8", "-output", out, abs], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    return readFileSync(out, "utf8");
  } finally {
    try {
      unlinkSync(out);
    } catch {
      // best-effort cleanup
    }
  }
}

/** Minimal html -> markdown for the subset textutil emits (headings, lists, paras, tables). */
function htmlToMd(html: string): string {
  // Drop everything outside <body>; textutil always emits a full document.
  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  let body = bodyMatch ? bodyMatch[1] : html;
  // Strip styles and comments.
  body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  // Block-level conversions.
  body = body
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n")
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n")
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n")
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n")
    .replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n")
    .replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n")
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/(ul|ol|div|section|article|blockquote)>/gi, "\n");
  // Inline conversions.
  body = body
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*")
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  // Tables: textutil emits <table><tr><td>...</td></tr></table>.
  body = body.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_m, inner: string) => {
    const rows = [...inner.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((rm) => rm[1]);
    if (rows.length === 0) return "";
    const cells = rows.map((r) =>
      [...r.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cm) => stripTags(cm[1]).trim()),
    );
    if (cells[0].length === 0) return "";
    const sep = cells[0].map(() => "---").join(" | ");
    const lines = [
      `| ${cells[0].join(" | ")} |`,
      `| ${sep} |`,
      ...cells.map((r) => `| ${r.join(" | ")} |`),
    ];
    return `\n${lines.join("\n")}\n`;
  });
  // Strip remaining tags.
  body = stripTags(body);
  // Decode common entities.
  body = body
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  // Collapse excess blank lines.
  body = body.replace(/\n{3,}/g, "\n\n").trim();
  return body;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

export async function readDoc(cwd: string, params: { path: string }): Promise<string> {
  const abs = safePath(cwd, params.path);
  let html: string;
  try {
    html = docToHtml(abs);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/not found|ENOENT|no such file/i.test(msg) && !/textutil/.test(msg)) {
      throw new Error(`Could not read ${params.path}: ${msg}`);
    }
    throw new Error(
      `Failed to convert .doc (is 'textutil' available? macOS only). Underlying error: ${msg}`,
    );
  }
  return htmlToMd(html);
}

export const readDocSchema = Type.Object({
  path: Type.String({ description: "Path to .doc file (Word 97-2003 binary). macOS textutil required." }),
});
