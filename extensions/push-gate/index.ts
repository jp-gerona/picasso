/**
 * push-gate - verify a branch before it is allowed to leave the machine.
 *
 * Flow: work happens in isolation on a branch; the gate runs the project's own
 * verification commands (declared in that project's AGENTS.md, never hardcoded);
 * only if every check passes does it push and open a PR via gh. On any failure
 * nothing is pushed and the exact failing check is reported.
 *
 * Every command the gate executes - checks, git, gh - is screened by
 * bash-guard's risk assessment first: interactive sessions get a confirm
 * dialog, headless sessions abort on critical findings.
 *
 * Usable two ways:
 *   - inside Pi: /push-gate <branch>
 *   - standalone: node --experimental-strip-types index.ts <branch> [cwd]
 */

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assess } from "../bash-guard/index.ts";
import { render } from "../../skills/git-messages/render.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Verification commands come from the project's AGENTS.md: every backticked
// bullet or fenced-code line under a "## Verification" heading.
//
//   ## Verification
//   - `npm test`
//   - `npm run lint`
// ---------------------------------------------------------------------------

export function parseVerificationCommands(agentsMd: string): string[] {
  const lines = agentsMd.split("\n");
  const commands: string[] = [];
  let inSection = false;
  let inFence = false;
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      inSection = /^##\s+verification\b/i.test(line.trim());
      continue;
    }
    if (!inSection) continue;
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (line.trim()) commands.push(line.trim());
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+`([^`]+)`/);
    if (bullet) commands.push(bullet[1]);
  }
  return commands;
}

// ---------------------------------------------------------------------------
// Gate core
// ---------------------------------------------------------------------------

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export type Exec = (command: string, cwd: string) => Promise<ExecResult>;

/** Ask permission for a risky command. Return false to abort the gate. */
export type GuardPrompt = (command: string, reason: string) => Promise<boolean>;

export interface GateOptions {
  branch: string;
  cwd: string;
  exec: Exec;
  /** Interactive confirm; undefined = headless (critical findings abort). */
  confirm?: GuardPrompt;
  log: (line: string) => void;
}

export interface GateOutcome {
  ok: boolean;
  failedCheck?: string;
  prUrl?: string;
  reason?: string;
}

/**
 * PR body via the git-messages template system (skills/git-messages).
 * Every field comes from data the gate actually observed: the branch's real
 * commits and diff stat, and the checks it just ran. Empty fields become
 * explicit "none" lines inside render(), never omitted sections.
 */
async function buildPrBody(opts: GateOptions, passedChecks: string[]): Promise<string> {
  const commits = await guardedExec("git log origin/main..HEAD --format='- %s'", opts);
  const stat = await guardedExec("git diff --stat origin/main...HEAD", opts);
  const subjects = commits !== "aborted" && commits.code === 0 ? commits.stdout.trim() : "";
  const diffStat = stat !== "aborted" && stat.code === 0 ? stat.stdout.trim() : "";
  return render("pr", {
    summary: `Branch \`${opts.branch}\`, verified by push-gate before leaving the machine.`,
    changes: [subjects, diffStat ? "```\n" + diffStat + "\n```" : ""].filter(Boolean).join("\n\n"),
    verification: passedChecks.map((c) => `- \`${c}\` - exit 0`).join("\n"),
    risk: undefined, // gate has no risk evidence; render() states "None identified."
  });
}

async function guardedExec(cmd: string, opts: GateOptions): Promise<ExecResult | "aborted"> {
  const finding = assess(cmd);
  if (finding) {
    if (!opts.confirm) {
      if (finding.tier === "critical") {
        opts.log(`bash-guard blocked (headless, ${finding.category}): ${cmd}`);
        return "aborted";
      }
    } else if (!(await opts.confirm(cmd, `${finding.category}: ${finding.reason}`))) {
      opts.log(`bash-guard: declined: ${cmd}`);
      return "aborted";
    }
  }
  return opts.exec(cmd, opts.cwd);
}

function tail(text: string, lines = 15): string {
  return text.trim().split("\n").slice(-lines).join("\n");
}

export async function runGate(opts: GateOptions): Promise<GateOutcome> {
  const { branch, cwd, log } = opts;

  const head = await guardedExec("git rev-parse --abbrev-ref HEAD", opts);
  if (head === "aborted") return { ok: false, reason: "guard aborted" };
  if (head.code !== 0) return { ok: false, reason: `not a git repository: ${cwd}` };
  const current = head.stdout.trim();
  if (current !== branch) {
    return {
      ok: false,
      reason: `branch "${branch}" is not checked out (HEAD is "${current}"). Check it out first; the gate never switches branches for you.`,
    };
  }
  if (branch === "main" || branch === "master") {
    return { ok: false, reason: "refusing to gate the default branch; work on a feature branch" };
  }

  const agentsPath = path.join(cwd, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    return { ok: false, reason: `no AGENTS.md in ${cwd}; declare a "## Verification" section there` };
  }
  const checks = parseVerificationCommands(fs.readFileSync(agentsPath, "utf8"));
  if (checks.length === 0) {
    return { ok: false, reason: `AGENTS.md has no "## Verification" commands; refusing to push unverified work` };
  }

  log(`Running ${checks.length} verification check(s) from AGENTS.md on branch ${branch}`);
  for (const check of checks) {
    log(`  check: ${check}`);
    const result = await guardedExec(check, opts);
    if (result === "aborted") return { ok: false, reason: "guard aborted", failedCheck: check };
    if (result.code !== 0) {
      log(`  FAILED (exit ${result.code})`);
      return {
        ok: false,
        failedCheck: check,
        reason: `check failed (exit ${result.code}): ${check}\n${tail(result.stdout + "\n" + result.stderr)}`,
      };
    }
    log(`  passed`);
  }

  log("All checks passed; pushing");
  const push = await guardedExec(`git push -u origin ${branch}`, opts);
  if (push === "aborted") return { ok: false, reason: "guard aborted at push" };
  if (push.code !== 0) return { ok: false, reason: `push failed:\n${tail(push.stderr)}` };

  const subject = await guardedExec("git log -1 --format=%s", opts);
  const title = subject !== "aborted" && subject.code === 0 ? subject.stdout.trim() : branch;
  const body = await buildPrBody(opts, checks);
  const pr = await guardedExec(
    `gh pr create --head ${branch} --title ${JSON.stringify(title)} --body ${JSON.stringify(body)}`,
    opts,
  );
  if (pr === "aborted") return { ok: false, reason: "guard aborted at PR creation" };
  if (pr.code !== 0) return { ok: false, reason: `pushed, but gh pr create failed:\n${tail(pr.stderr)}` };

  const prUrl = pr.stdout.trim().split("\n").pop() ?? "";
  log(`PR opened: ${prUrl}`);
  return { ok: true, prUrl };
}

// ---------------------------------------------------------------------------
// Pi extension wiring
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
  const exec: Exec = async (command, cwd) => {
    const r = await pi.exec("bash", ["-c", command], { cwd });
    return { stdout: r.stdout, stderr: r.stderr, code: r.code };
  };

  pi.registerCommand("push-gate", {
    description: "Verify a branch (checks from AGENTS.md), then push and open a PR",
    handler: async (args, ctx) => {
      const branch = (args ?? "").trim();
      if (!branch) {
        ctx.ui.notify("Usage: /push-gate <branch>", "error");
        return;
      }
      const outcome = await runGate({
        branch,
        cwd: ctx.cwd,
        exec,
        confirm: ctx.hasUI
          ? (cmd, reason) => ctx.ui.confirm("push-gate", `${reason}\n\n${cmd}\n\nRun this command?`)
          : undefined,
        log: (line) => ctx.ui.notify(line, "info"),
      });
      if (outcome.ok) {
        ctx.ui.notify(`push-gate: PASSED - ${outcome.prUrl}`, "info");
      } else {
        ctx.ui.notify(`push-gate: BLOCKED - ${outcome.reason ?? outcome.failedCheck}`, "error");
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Standalone CLI: node --experimental-strip-types index.ts <branch> [cwd]
// ---------------------------------------------------------------------------

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const branch = process.argv[2];
  const cwd = path.resolve(process.argv[3] ?? process.cwd());
  if (!branch) {
    console.error("usage: index.ts <branch> [cwd]");
    process.exit(2);
  }
  const exec: Exec = (command, dir) =>
    new Promise((resolve) => {
      const p = spawn("bash", ["-c", command], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));
      p.on("error", (e) => resolve({ stdout, stderr: String(e), code: -1 }));
      p.on("close", (code) => resolve({ stdout, stderr, code }));
    });
  runGate({ branch, cwd, exec, log: (l) => console.log(l) }).then((outcome) => {
    if (outcome.ok) {
      console.log(`PASSED - ${outcome.prUrl}`);
    } else {
      console.error(`BLOCKED - ${outcome.reason ?? outcome.failedCheck}`);
      process.exit(1);
    }
  });
}
