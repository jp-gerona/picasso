// git-messages.test.ts - render()/sanitize() contract: fixed section order,
// explicit empty defaults, em-dash sanitization, and the footer omission rules.
//
// Run: node --experimental-strip-types tests/git-messages.test.ts
import assert from "node:assert";
import { render, sanitize } from "../skills/git-messages/render.ts";

assert.strictEqual(sanitize("a—b and c – d"), "a - b and c - d");

const pr = render("pr", { summary: "S", changes: "C", verification: "V", risk: undefined });
assert.ok(pr.includes("## Risk/Rollback\n\nNone identified."), "empty risk gets explicit line");
assert.ok(
  pr.indexOf("## Summary") < pr.indexOf("## Changes") &&
    pr.indexOf("## Changes") < pr.indexOf("## Verification") &&
    pr.indexOf("## Verification") < pr.indexOf("## Risk"),
  "section order fixed",
);

const issue = render("issue", {
  problem: "P",
  expected_vs_actual: undefined,
  repro_steps: undefined,
  context: undefined,
});
assert.ok(issue.includes("No known reproduction."));

const commit = render("commit", {
  type: "feat",
  summary: "add thing — with em dash",
  body: undefined,
  footer: undefined,
});
assert.ok(!commit.includes("—"), "em dash sanitized");
assert.ok(commit.startsWith("feat: add thing - with em dash"));

const commitNoIssues = render("commit", {
  type: "fix",
  summary: "fix bug",
  body: "details",
  footer: undefined,
});
assert.ok(
  !commitNoIssues.includes("No issue references"),
  "no explicit no-issue line when footer empty",
);
assert.ok(commitNoIssues.endsWith("details\n"), "footer omitted entirely when no issues");

const commitWithIssues = render("commit", {
  type: "fix",
  summary: "fix bug",
  body: "details",
  footer: "Closes #42",
});
assert.ok(commitWithIssues.includes("Closes #42"), "footer present when issues referenced");

assert.throws(() => render("commit", { summary: "x" } as never), /required/);
console.log("git-messages: all assertions passed");
