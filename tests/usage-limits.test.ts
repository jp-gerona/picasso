import assert from "node:assert";
import { parseOpenAiCodexUsage, parseOpenCodeGoUsage } from "../extensions/usage-limits/data.ts";
import { fetchOpenAiCodexUsage, fetchOpenCodeGoUsage } from "../extensions/usage-limits/adapters.ts";
import { getSessionUsage } from "../extensions/usage-limits/session-stats.ts";
import { buildUsagePanelLines, renderUsagePanelLine } from "../extensions/usage-limits/panel.ts";
import { collectUsageResults } from "../extensions/usage-limits/controller.ts";
import { registerUsageCommand } from "../extensions/usage-limits/command.ts";

const usage = parseOpenCodeGoUsage({
	usage: {
		rolling: { status: "ok", percent: 18, resetsAt: "2026-09-08T12:00:00.000Z" },
		weekly: { status: "ok", percent: 42, resetsAt: "2026-09-12T00:00:00.000Z" },
		monthly: { status: "rate-limited", percent: 100, resetsAt: "2026-10-01T00:00:00.000Z" },
	},
});

assert.deepStrictEqual(usage, {
	provider: "opencode-go",
	name: "OpenCode Go",
	windows: [
		{ label: "Rolling", percent: 18, resetsAt: "2026-09-08T12:00:00.000Z", limited: false },
		{ label: "Weekly", percent: 42, resetsAt: "2026-09-12T00:00:00.000Z", limited: false },
		{ label: "Monthly", percent: 100, resetsAt: "2026-10-01T00:00:00.000Z", limited: true },
	],
});

const codexUsage = parseOpenAiCodexUsage({
	plan_type: "plus",
	rate_limit: {
		allowed: true,
		limit_reached: false,
		primary_window: {
			used_percent: 27,
			limit_window_seconds: 18_000,
			reset_after_seconds: 7_200,
			reset_at: 1_788_867_200,
		},
		secondary_window: {
			used_percent: 61,
			limit_window_seconds: 604_800,
			reset_after_seconds: 172_800,
			reset_at: 1_789_040_000,
		},
	},
});

assert.deepStrictEqual(codexUsage, {
	provider: "openai-codex",
	name: "OpenAI Codex",
	plan: "Plus",
	windows: [
		{ label: "5 hours", percent: 27, resetsAt: "2026-09-08T11:33:20.000Z", limited: false },
		{ label: "7 days", percent: 61, resetsAt: "2026-09-10T11:33:20.000Z", limited: false },
	],
});

const requests: Array<{ url: string; init: RequestInit }> = [];
const fetchedUsage = await fetchOpenCodeGoUsage("test-key", async (url, init) => {
	requests.push({ url, init: init ?? {} });
	return new Response(
		JSON.stringify({
			usage: {
				rolling: { status: "ok", percent: 5, resetsAt: "2026-09-08T12:00:00.000Z" },
				weekly: { status: "ok", percent: 10, resetsAt: "2026-09-12T00:00:00.000Z" },
				monthly: { status: "ok", percent: 15, resetsAt: "2026-10-01T00:00:00.000Z" },
			},
		}),
	);
});
assert.strictEqual(requests.length, 1, "OpenCode usage is fetched once");
assert.deepStrictEqual(requests[0], {
	url: "https://opencode.ai/zen/go/v1/usage",
	init: { headers: { Authorization: "Bearer test-key" } },
});
assert.strictEqual(fetchedUsage.windows[0].percent, 5, "fetched response is normalized");

const codexToken = [
	"header",
	Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account-123" } })).toString("base64url"),
	"signature",
].join(".");
const codexRequests: Array<{ url: string; init: RequestInit }> = [];
const fetchedCodexUsage = await fetchOpenAiCodexUsage(codexToken, async (url, init) => {
	codexRequests.push({ url, init: init ?? {} });
	return new Response(
		JSON.stringify({
			plan_type: "pro",
			rate_limit: {
				allowed: true,
				limit_reached: false,
				primary_window: {
					used_percent: 9,
					limit_window_seconds: 18_000,
					reset_after_seconds: 1_800,
					reset_at: 1_788_867_200,
				},
			},
		}),
	);
});
assert.deepStrictEqual(codexRequests, [
	{
		url: "https://chatgpt.com/backend-api/wham/usage",
		init: {
			headers: {
				Authorization: `Bearer ${codexToken}`,
				"chatgpt-account-id": "account-123",
			},
		},
	},
]);
assert.strictEqual(fetchedCodexUsage.plan, "Pro", "Codex response is normalized");

const sessionUsage = getSessionUsage(
	[
		{ type: "message", message: { role: "assistant", provider: "openai-codex", usage: { input: 100, output: 20, cacheRead: 50 } } },
		{ type: "message", message: { role: "assistant", provider: "opencode-go", usage: { input: 30, output: 10, cacheRead: 0 } } },
		{ type: "message", message: { role: "assistant", provider: "openai-codex", usage: { input: 40, output: 5, cacheRead: 4 } } },
		{ type: "message", message: { role: "user" } },
	],
	"openai-codex",
);
assert.deepStrictEqual(sessionUsage, { requests: 2, input: 140, output: 25, cacheRead: 54 });

assert.deepStrictEqual(
	buildUsagePanelLines(
		[
			{
				usage,
				session: { requests: 3, input: 12_345, output: 678, cacheRead: 90 },
			},
			{
				provider: "openai-codex",
				error: "usage request failed (401)",
				session: { requests: 0, input: 0, output: 0, cacheRead: 0 },
			},
		],
		Date.parse("2026-09-02T10:58:30.000Z"),
	),
	[
		{ text: "────────────────────────────────", color: "border" },
		{ text: "" },
		{ text: "Usage limits", color: "yellow" },
		{ text: "" },
		{ text: "OpenCode Go", color: "teal" },
		{ text: "Session: 3 requests - in 12.3k - out 678 - cache 90" },
		{
			segments: [
				{ text: "Rolling   " },
				{ text: "███" },
				{ text: "░░░░░░░░░░░░░░░", color: "muted" },
				{ text: "  18%  resets in 6d 1h 1m - Sep 8, 20:00 PHT" },
			],
		},
		{
			segments: [
				{ text: "Weekly    " },
				{ text: "████████" },
				{ text: "░░░░░░░░░░", color: "muted" },
				{ text: "  42%  resets in 9d 13h 1m - Sep 12, 08:00 PHT" },
			],
		},
		{
			segments: [
				{ text: "Monthly   " },
				{ text: "██████████████████" },
				{ text: "  100%  resets in 28d 13h 1m - Oct 1, 08:00 PHT" },
			],
			color: "red",
		},
		{ text: "" },
		{ text: "OpenAI Codex", color: "teal" },
		{ text: "Error: usage request failed (401)", color: "red" },
		{ text: "" },
		{ text: "Esc closes - rerun /usage to refresh", color: "muted" },
		{ text: "────────────────────────────────", color: "border" },
	],
);

const widePanel = buildUsagePanelLines(
	[
		{
			usage,
			session: { requests: 3, input: 12_345, output: 678, cacheRead: 90 },
		},
	],
	Date.parse("2026-09-02T10:58:30.000Z"),
	80,
);
assert.strictEqual(widePanel[0].text, "─".repeat(80), "top divider fills the available editor width");
assert.strictEqual(widePanel.at(-1)?.text, "─".repeat(80), "bottom divider fills the available editor width");

assert.strictEqual(
	renderUsagePanelLine(
		{
			segments: [
				{ text: "███" },
				{ text: "░░░", color: "muted" },
			],
		},
		(text, color) => (color ? `<${color}>${text}</${color}>` : text),
	),
	"███<muted>░░░</muted>",
);

const collected = await collectUsageResults(
	[{ type: "message", message: { role: "assistant", provider: "opencode-go", usage: { input: 9, output: 2, cacheRead: 1 } } }],
	{
		hasCredential: () => true,
		getApiKey: async (provider) => (provider === "openai-codex" ? codexToken : "test-key"),
		request: async (url) => {
			if (url.includes("chatgpt.com")) {
				return new Response("unavailable", { status: 503 });
			}
			return new Response(
				JSON.stringify({
					usage: {
						rolling: { status: "ok", percent: 1, resetsAt: "2026-09-08T12:00:00.000Z" },
						weekly: { status: "ok", percent: 2, resetsAt: "2026-09-12T00:00:00.000Z" },
						monthly: { status: "ok", percent: 3, resetsAt: "2026-10-01T00:00:00.000Z" },
					},
				}),
			);
		},
	},
);
assert.deepStrictEqual(collected.map((result) => [result.provider ?? result.usage?.provider, result.usage?.name, result.error, result.session]), [
	["openai-codex", undefined, "Usage request failed (503)", { requests: 0, input: 0, output: 0, cacheRead: 0 }],
	["opencode-go", "OpenCode Go", undefined, { requests: 1, input: 9, output: 2, cacheRead: 1 }],
]);

const commands: Record<string, { description: string; handler: (args: string, ctx: any) => Promise<void> }> = {};
registerUsageCommand(
	{
		registerCommand(name, command) {
			commands[name] = command;
		},
	} as any,
	() => {},
	{ hasCredential: () => false },
);
const notifications: Array<[string, string | undefined]> = [];
await commands.usage.handler("", {
	mode: "tui",
	ui: {
		notify(message: string, type?: string) {
			notifications.push([message, type]);
		},
	},
} as any);
assert.strictEqual(commands.usage.description, "Show authenticated subscription usage limits");
assert.deepStrictEqual(notifications, [["No supported authenticated providers", "warning"]]);

console.log("usage-limits: usage parsing, fetching, collection, display, and command registration passed");
