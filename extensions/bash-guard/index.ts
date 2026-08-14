/**
 * bash-guard - a Pi extension that inspects bash tool calls before they run.
 *
 * Interactive sessions (ctx.hasUI): risky commands raise a confirm/abort dialog.
 * Headless sessions (subagents, print mode): a catastrophic-only subset is
 * hard-blocked with no prompt, since nobody is present to answer a dialog.
 *
 * Only the `bash` tool is intercepted. Edits/writes and user-issued `!`
 * commands (which fire `user_bash`, not `tool_call`) are untouched.
 */

import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Tokenizer: split a shell command line into segments (one per simple command)
// and each segment into words. Quote-aware, no dependencies. This is not a
// full shell parser - it only needs to be good enough to find command heads,
// flags, and pipe boundaries.
// ---------------------------------------------------------------------------

export interface Segment {
  /** Words of this simple command, quotes stripped. */
  words: string[];
  /** Operator that connected this segment to the previous one, if any. */
  joiner: "|" | "&&" | "||" | ";" | "&" | "\n" | null;
}

export function splitSegments(command: string): Segment[] {
  const segments: Segment[] = [];
  let words: string[] = [];
  let word = "";
  let wordStarted = false;
  let joiner: Segment["joiner"] = null;
  let quote: '"' | "'" | null = null;

  const pushWord = () => {
    if (wordStarted) {
      words.push(word);
      word = "";
      wordStarted = false;
    }
  };
  const pushSegment = (nextJoiner: Segment["joiner"]) => {
    pushWord();
    if (words.length > 0) {
      segments.push({ words, joiner });
    }
    words = [];
    joiner = nextJoiner;
  };

  for (let i = 0; i < command.length; i++) {
    const c = command[i];

    if (quote) {
      if (c === "\\" && quote === '"' && i + 1 < command.length) {
        word += command[++i];
      } else if (c === quote) {
        quote = null;
      } else {
        word += c;
      }
      continue;
    }

    if (c === "'" || c === '"') {
      quote = c;
      wordStarted = true;
      continue;
    }
    if (c === "\\" && i + 1 < command.length) {
      word += command[++i];
      wordStarted = true;
      continue;
    }
    // Command substitution introduces a nested command; treat its interior
    // as a fresh segment stream so `echo $(rm -rf /)` is still seen.
    if (c === "$" && command[i + 1] === "(") {
      pushSegment(";");
      i++; // skip "("
      continue;
    }
    if (c === "`" || c === "(" || c === ")" || c === "{" || c === "}") {
      pushSegment(";");
      continue;
    }
    if (c === "&" || c === "|" || c === ";" || c === "\n") {
      const two = c + (command[i + 1] ?? "");
      if (two === "&&" || two === "||") {
        pushSegment(two);
        i++;
      } else {
        pushSegment(c as "|" | ";" | "&" | "\n");
      }
      continue;
    }
    if (c === " " || c === "\t") {
      pushWord();
      continue;
    }
    word += c;
    wordStarted = true;
  }
  pushSegment(null);
  return segments;
}

// ---------------------------------------------------------------------------
// Risk detection
// ---------------------------------------------------------------------------

export type Tier = "critical" | "caution";

export interface Finding {
  tier: Tier;
  category: string;
  reason: string;
}

const SHELL_HEADS = new Set(["sh", "bash", "zsh", "ksh", "dash", "fish"]);
const DOWNLOADERS = new Set(["curl", "wget", "fetch"]);
const FORMAT_TOOLS = new Set(["fdisk", "parted", "gpart", "gdisk", "sgdisk", "newfs", "mkswap"]);
const INFRA_TEARDOWN: Array<{ head: string; sub: RegExp; label: string }> = [
  { head: "terraform", sub: /^(destroy|apply)$/, label: "terraform destroy/apply" },
  { head: "pulumi", sub: /^(destroy|up)$/, label: "pulumi destroy/up" },
  { head: "kubectl", sub: /^(delete|drain)$/, label: "kubectl delete/drain" },
  { head: "helm", sub: /^(uninstall|delete)$/, label: "helm uninstall" },
  { head: "aws", sub: /^(delete|terminate|deregister)-/, label: "aws resource deletion" },
  { head: "gcloud", sub: /^delete$/, label: "gcloud delete" },
  { head: "az", sub: /^delete$/, label: "az delete" },
  { head: "docker", sub: /^(rm|rmi|prune)$/, label: "docker removal" },
];

/** Git subcommands that rewrite or discard history / working state. */
const GIT_DESTRUCTIVE = new Set([
  "rebase",
  "filter-branch",
  "filter-repo",
  "reflog", // expire/delete drop recovery points
]);

function basename(word: string): string {
  const clean = word.replace(/^["']|["']$/g, "");
  const slash = clean.lastIndexOf("/");
  return slash >= 0 ? clean.slice(slash + 1) : clean;
}

function flags(words: string[]): Set<string> {
  const out = new Set<string>();
  for (const w of words.slice(1)) {
    if (/^--[a-z-]+/.test(w)) {
      out.add(w.split("=")[0]);
    } else if (/^-[a-zA-Z]+$/.test(w)) {
      for (const c of w.slice(1)) out.add(`-${c}`);
    }
  }
  return out;
}

function checkSegment(seg: Segment, prev: Segment | undefined): Finding | null {
  if (seg.words.length === 0) return null;
  let words = seg.words;
  let head = basename(words[0]);

  // Wrappers that execute their argument list as a new command.
  while ((head === "env" || head === "nohup" || head === "time" || head === "xargs") && words.length > 1) {
    words = words.slice(1).filter((w, i) => !(i === 0 && head === "env" && w.includes("=")));
    head = basename(words[0]);
    if (head === words[0] && words[0].includes("=")) return null;
  }

  const f = flags(words);

  // sudo: privilege escalation. Also inspect the wrapped command.
  if (head === "sudo" || head === "doas") {
    const inner = checkSegment({ words: words.slice(1), joiner: null }, prev);
    if (inner) return inner;
    return { tier: "critical", category: "sudo", reason: "privilege escalation via sudo/doas" };
  }

  // Recursive or forced deletion.
  if (head === "rm" && (f.has("-r") || f.has("-R") || f.has("-f") || f.has("--recursive") || f.has("--force"))) {
    return { tier: "critical", category: "deletion", reason: "recursive or forced rm" };
  }
  if (head === "find" && words.includes("-delete")) {
    return { tier: "critical", category: "deletion", reason: "find -delete removes files in bulk" };
  }
  if ((head === "shred" || head === "srm") && words.length > 1) {
    return { tier: "critical", category: "deletion", reason: "secure-erase tool destroys file contents" };
  }

  // Disk / filesystem formatting and partitioning.
  if (head.startsWith("mkfs") || FORMAT_TOOLS.has(head)) {
    return { tier: "critical", category: "disk", reason: `disk/partition tool: ${head}` };
  }
  if (head === "diskutil" && /^(erasedisk|erasevolume|partitiondisk|zerodisk|reformat)$/i.test(words[1] ?? "")) {
    return { tier: "critical", category: "disk", reason: `diskutil ${words[1]}` };
  }
  if (head === "dd" && words.some((w) => /^of=\/dev\//.test(w))) {
    return { tier: "critical", category: "disk", reason: "dd writing directly to a device" };
  }

  // Pipe-to-shell: previous segment downloads, this one is a shell fed by a pipe.
  if (seg.joiner === "|" && SHELL_HEADS.has(head) && prev && DOWNLOADERS.has(basename(prev.words[0] ?? ""))) {
    return { tier: "critical", category: "pipe-to-shell", reason: "piping downloaded content into a shell" };
  }

  // Infra teardown.
  for (const rule of INFRA_TEARDOWN) {
    if (head === rule.head && rule.sub.test(words[1] ?? "")) {
      return { tier: "critical", category: "infra", reason: rule.label };
    }
  }

  // Git.
  if (head === "git") {
    const sub = words.find((w, i) => i > 0 && !w.startsWith("-")) ?? "";
    if (GIT_DESTRUCTIVE.has(sub)) {
      return { tier: "critical", category: "git-history", reason: `git ${sub} rewrites or discards history` };
    }
    if (sub === "reset" && f.has("--hard")) {
      return { tier: "critical", category: "git-history", reason: "git reset --hard discards work" };
    }
    if (sub === "push" && (f.has("--force") || f.has("-f") || f.has("--force-with-lease"))) {
      return { tier: "critical", category: "git-history", reason: "force push rewrites remote history" };
    }
    if (sub === "clean" && (f.has("-f") || f.has("--force"))) {
      return { tier: "critical", category: "git-history", reason: "git clean -f deletes untracked files" };
    }
    if (sub === "branch" && (f.has("-D") || f.has("--delete"))) {
      return { tier: "critical", category: "git-history", reason: "deleting a branch can discard commits" };
    }
    if (sub === "checkout" && words.includes("--")) {
      return { tier: "critical", category: "git-history", reason: "git checkout -- discards local changes" };
    }
    // Any other git command: prompt in interactive mode, allowed headless.
    return { tier: "caution", category: "git", reason: `git ${sub || "(bare)"}` };
  }

  return null;
}

export function assess(command: string): Finding | null {
  const segments = splitSegments(command);
  let worst: Finding | null = null;
  for (let i = 0; i < segments.length; i++) {
    const found = checkSegment(segments[i], segments[i - 1]);
    if (found && (!worst || (worst.tier === "caution" && found.tier === "critical"))) {
      worst = found;
    }
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Extension wiring
// ---------------------------------------------------------------------------

const DECLINE_TTL_MS = 5 * 60 * 1000;

export default function (pi: ExtensionAPI) {
  /** Recently declined commands: exact command string -> decline timestamp. */
  const declined = new Map<string, number>();

  function recentlyDeclined(command: string): boolean {
    const at = declined.get(command);
    if (at === undefined) return false;
    if (Date.now() - at > DECLINE_TTL_MS) {
      declined.delete(command);
      return false;
    }
    return true;
  }

  pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    if (event.toolName !== "bash") return undefined;
    const command = String((event.input as { command?: unknown }).command ?? "");
    if (!command) return undefined;

    const finding = assess(command);
    if (!finding) return undefined;

    // Headless (subagent / print mode): nobody can answer a dialog.
    if (!ctx.hasUI) {
      if (finding.tier === "critical") {
        return {
          block: true,
          reason:
            `bash-guard: blocked in headless session (${finding.category}: ${finding.reason}). ` +
            `Ask the main session to run this if it is genuinely needed.`,
        };
      }
      return undefined; // caution-tier passes when no one can confirm
    }

    // Interactive: identical command declined moments ago? Don't re-prompt.
    if (recentlyDeclined(command)) {
      return {
        block: true,
        reason:
          "bash-guard: this exact command was declined recently. " +
          "Not re-prompting; choose a different approach.",
      };
    }

    const ok = await ctx.ui.confirm(
      `bash-guard: ${finding.category}`,
      `${finding.reason}\n\n${command}\n\nRun this command?`,
    );
    if (ok) return undefined;

    declined.set(command, Date.now());
    return {
      block: true,
      reason: `bash-guard: user declined (${finding.category}: ${finding.reason}).`,
    };
  });
}
