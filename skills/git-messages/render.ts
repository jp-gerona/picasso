/**
 * render - template renderer for git-messages. Used by the push-gate extension
 * and any other code that emits commit messages, PR bodies, or issue bodies.
 *
 * Deterministic means: fixed structure from the template, every placeholder
 * always filled. A field with no real content gets an explicit "none" line
 * (from EMPTY_DEFAULTS) instead of being omitted, and all output is sanitized
 * to AGENTS.md style (dash, never em dash).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "templates");

export type TemplateName = "commit" | "pr" | "issue";

/** What an empty field must say, per template field, so absence is explicit. */
const EMPTY_DEFAULTS: Record<TemplateName, Record<string, string>> = {
  commit: {
    body: "No body: the header says everything this change does.",
    // Footer is the one exception to "never omit": when no issue is referenced
    // the footer is omitted entirely rather than stating "No issue references."
    footer: "",
  },
  pr: {
    summary: "None provided.",
    changes: "None listed.",
    verification: "Nothing was run.",
    risk: "None identified.",
  },
  issue: {
    problem: "Not described.",
    expected_vs_actual: "Not described.",
    repro_steps: "No known reproduction.",
    context: "No additional context.",
  },
};

/** Replace em/en dashes per AGENTS.md: dash, not em dash, no exceptions. */
export function sanitize(text: string): string {
  return text.replace(/\s*—\s*/g, " - ").replace(/–/g, "-");
}

export function render(name: TemplateName, fields: Record<string, string | undefined>): string {
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.md`), "utf8");
  const defaults = EMPTY_DEFAULTS[name];
  const out = template.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const value = fields[key]?.trim();
    if (value) return sanitize(value);
    const fallback = defaults[key];
    if (fallback !== undefined) return fallback;
    throw new Error(`git-messages: template "${name}" field "${key}" is required and has no empty-default`);
  });
  // Collapse runs of blank lines left by short fields; keep structure intact.
  return out.replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
