/**
 * repo-review scan script. Gathers facts about an external GitHub repo,
 * read-only. It never runs anything from the target repo: shallow clone and
 * text scanning only. The verdict is written by the reviewing agent, not here.
 *
 * Usage: node --experimental-strip-types scan.ts <owner>/<repo>
 * Output: references/<owner>-<repo>.md (relative to this script)
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const slug = process.argv[2];
if (!slug || !/^[\w.-]+\/[\w.-]+$/.test(slug)) {
  console.error("usage: scan.ts <owner>/<repo>");
  process.exit(2);
}
const [owner, repo] = slug.split("/");

const TEST_DIR_RE = /(^|\/)(tests?|__tests__|testdata|spec|fixtures|e2e)(\/|$)/;
const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".woff", ".woff2", ".ttf",
  ".pdf", ".zip", ".gz", ".tar", ".jar", ".exe", ".bin", ".wasm", ".lock",
]);
const MANIFESTS = [
  "package.json", "go.mod", "go.sum", "Cargo.toml", "requirements.txt",
  "pyproject.toml", "setup.py", "Gemfile", "pom.xml", "build.gradle",
  "composer.json", "mix.exs", "Package.swift",
];
const TELEMETRY_RE = /telemetry|analytics|segment\.(io|com)|posthog|sentry|amplitude|mixpanel|datadog|track(ing|Event)|usage.?stats|crash.?report/i;
const CRED_RE = /process\.env\.|os\.environ|os\.Getenv|getenv\(|LookupEnv|API_?KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|\.aws\/|\.ssh\/|keychain|keyring/i;
const INSTALL_HOOK_RE = /"(pre|post)install"|"prepare"|curl[^\n|]*\|\s*(ba)?sh|wget[^\n|]*\|\s*(ba)?sh/i;
const URL_RE = /https?:\/\/[^\s"'`)\]}>\\]+/g;

function walk(dir: string, rel = ""): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), r));
    else out.push(r);
  }
  return out;
}

function isTextFile(full: string): boolean {
  if (BINARY_EXT.has(path.extname(full).toLowerCase())) return false;
  try {
    const buf = fs.readFileSync(full);
    if (buf.length > 1_000_000) return false;
    return !buf.subarray(0, 4096).includes(0);
  } catch {
    return false;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "repo-review-"));
const cloneDir = path.join(tmp, repo);
try {
  console.error(`shallow-cloning ${slug} ...`);
  execFileSync("git", ["clone", "--depth", "1", "--quiet", `https://github.com/${slug}.git`, cloneDir], {
    stdio: ["ignore", "ignore", "inherit"],
  });
  const headSha = execFileSync("git", ["-C", cloneDir, "rev-parse", "HEAD"]).toString().trim();

  const files = walk(cloneDir).sort();
  const topLevel = [...new Set(files.map((f) => f.split("/")[0]))].sort();

  const urls = new Map<string, string>(); // url -> first file seen in
  const telemetryHits: string[] = [];
  const credHits: string[] = [];
  const installHits: string[] = [];
  const manifests = files.filter((f) => MANIFESTS.includes(path.basename(f)));
  const shellScripts = files.filter((f) => /\.(sh|bash|ps1|bat|cmd)$/.test(f));

  for (const f of files) {
    const full = path.join(cloneDir, f);
    if (!isTextFile(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    const lines = text.split("\n");

    if (!TEST_DIR_RE.test(f)) {
      for (const m of text.matchAll(URL_RE)) {
        const url = m[0].replace(/[.,;:]+$/, "");
        if (!urls.has(url)) urls.set(url, f);
      }
    }
    lines.forEach((line, i) => {
      const loc = `${f}:${i + 1}`;
      const trimmed = line.trim().slice(0, 160);
      if (TELEMETRY_RE.test(line) && telemetryHits.length < 80) telemetryHits.push(`${loc}: ${trimmed}`);
      if (CRED_RE.test(line) && credHits.length < 80) credHits.push(`${loc}: ${trimmed}`);
      if (INSTALL_HOOK_RE.test(line) && installHits.length < 40) installHits.push(`${loc}: ${trimmed}`);
    });
  }

  const section = (title: string, body: string) =>
    `## ${title}\n\n${body.trim() ? body.trim() : "Nothing found."}\n`;
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  const codeList = (items: string[]) => items.map((i) => `- \`${i}\``).join("\n");

  const sortedUrls = [...urls.entries()].sort(([a], [b]) => a.localeCompare(b));
  const report = [
    `# repo-review: ${slug}`,
    "",
    `Scanned at ${new Date().toISOString()}, HEAD \`${headSha}\`, shallow clone, read-only.`,
    `Files scanned: ${files.length}. This file is self-contained; no tool access needed to read it.`,
    "",
    "## Verdict",
    "",
    "(to be written by the reviewing agent from the findings below)",
    "",
    section("Repo structure (top level)", codeList(topLevel)),
    section("Dependency manifests", codeList(manifests)),
    section("Shell/install scripts present", codeList(shellScripts)),
    section("Install-hook / pipe-to-shell patterns", codeList(installHits)),
    section("Telemetry/analytics keyword matches", codeList(telemetryHits)),
    section("Credential / env-var access patterns", codeList(credHits)),
    section(
      `Outbound URLs referenced in source (tests excluded, ${sortedUrls.length} unique)`,
      list(sortedUrls.map(([u, f]) => `${u} (${f})`)),
    ),
  ].join("\n");

  const outPath = path.join(HERE, "references", `${owner}-${repo}.md`);
  fs.writeFileSync(outPath, report + "\n");
  console.error(`wrote ${outPath}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
