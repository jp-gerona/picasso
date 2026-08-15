// Run: node --experimental-strip-types tests/thinking.test.ts
import assert from "node:assert";
import thinkingExtension, { getSupportedLevels } from "../extensions/thinking.ts";

function createMockPi() {
	let currentLevel = "high";
	const commands = new Map();
	const calls = [];
	const pi = {
		registerCommand(name, options) {
			calls.push({ type: "register", name });
			commands.set(name, options);
		},
		setThinkingLevel(level) {
			currentLevel = level;
			calls.push({ type: "set", level });
		},
		getThinkingLevel() {
			return currentLevel;
		},
		commands,
		calls,
	};
	return pi;
}

function createMockCtx(overrides = {}) {
	const notify = [];
	return {
		ui: {
			select: async () => undefined,
			notify: (message, type = "info") => notify.push({ message, type }),
		},
		hasUI: true,
		model: { reasoning: true },
		notify,
		...overrides,
	};
}

// --- registration -----------------------------------------------------------
const pi = createMockPi();
thinkingExtension(pi);
assert.strictEqual(pi.commands.size, 1, "expected exactly one registered command");
const cmd = pi.commands.get("thinking");
assert.ok(cmd, "expected command named 'thinking' to be registered");
assert.strictEqual(cmd.description, "Set thinking level for the current model");
assert.strictEqual(cmd.argumentHint, "<level>");
assert.strictEqual(typeof cmd.handler, "function");
assert.strictEqual(typeof cmd.getArgumentCompletions, "function");

// --- autocomplete -----------------------------------------------------------
const allLevels = cmd.getArgumentCompletions("").map((item) => item.value);
assert.deepStrictEqual(allLevels, ["off", "minimal", "low", "medium", "high", "xhigh", "max"]);
const mediumMatches = cmd.getArgumentCompletions("me").map((item) => item.value);
assert.deepStrictEqual(mediumMatches, ["medium"], "prefix 'me' should suggest only 'medium'");
assert.strictEqual(cmd.getArgumentCompletions("zz"), null, "no matches should return null");
assert.ok(cmd.getArgumentCompletions("high")[0].description, "completion items should carry a description");

// --- getSupportedLevels ------------------------------------------------------
assert.deepStrictEqual(getSupportedLevels(undefined), ["off", "minimal", "low", "medium", "high"]);
assert.deepStrictEqual(getSupportedLevels({ reasoning: false }), ["off"]);
// xhigh/max require an explicit thinkingLevelMap entry (mirrors pi-ai behavior)
assert.deepStrictEqual(getSupportedLevels({ reasoning: true }), ["off", "minimal", "low", "medium", "high"]);
assert.deepStrictEqual(
	getSupportedLevels({ reasoning: true, thinkingLevelMap: { xhigh: null, max: "max" } }),
	["off", "minimal", "low", "medium", "high", "max"],
	"xhigh with null mapping should be excluded, max with mapping included",
);

// --- handler: direct argument ------------------------------------------------
{
	const p = createMockPi();
	thinkingExtension(p);
	const blockCmd = p.commands.get("thinking");
	const ctx = createMockCtx();
	await blockCmd.handler("high", ctx);
	assert.strictEqual(p.calls.at(-1).type, "set");
	assert.strictEqual(p.calls.at(-1).level, "high");
	assert.deepStrictEqual(ctx.notify.at(-1), { message: "Thinking level: high", type: "info" });
}

// --- handler: case-insensitive argument --------------------------------------
{
	const p = createMockPi();
	thinkingExtension(p);
	const blockCmd = p.commands.get("thinking");
	const ctx = createMockCtx();
	await blockCmd.handler("  MEDIUM  ", ctx);
	assert.strictEqual(p.calls.at(-1).level, "medium");
}

// --- handler: invalid argument ------------------------------------------------
{
	const p = createMockPi();
	thinkingExtension(p);
	const blockCmd = p.commands.get("thinking");
	const ctx = createMockCtx();
	await blockCmd.handler("ultra", ctx);
	assert.ok(!p.calls.some((c) => c.type === "set"), "no setThinkingLevel call for invalid level");
	assert.strictEqual(ctx.notify.at(-1).type, "warning");
	assert.match(ctx.notify.at(-1).message, /Invalid thinking level 'ultra'/);
	assert.match(ctx.notify.at(-1).message, /off, minimal, low, medium, high/);
}

// --- handler: non-thinking model ----------------------------------------------
{
	const p = createMockPi();
	thinkingExtension(p);
	const blockCmd = p.commands.get("thinking");
	const ctx = createMockCtx({ model: { reasoning: false } });
	await blockCmd.handler("high", ctx);
	assert.ok(!p.calls.some((c) => c.type === "set"), "no setThinkingLevel call on non-thinking model");
	assert.deepStrictEqual(ctx.notify.at(-1), {
		message: "Current model does not support thinking",
		type: "warning",
	});
	// ...but "off" is still valid on a non-thinking model
	await blockCmd.handler("off", ctx);
	assert.strictEqual(p.calls.at(-1).level, "off");
}

// --- handler: selector flow ----------------------------------------------------
{
	const p = createMockPi();
	thinkingExtension(p);
	const blockCmd = p.commands.get("thinking");
	const ctx = createMockCtx({
		ui: {
			select: async () => "medium - Moderate reasoning (~8k tokens)",
			notify: () => {},
		},
	});
	await blockCmd.handler("", ctx);
	assert.strictEqual(p.calls.at(-1).level, "medium", "selector selection should set the level");
}

// --- handler: selector cancel --------------------------------------------------
{
	const p = createMockPi();
	thinkingExtension(p);
	const blockCmd = p.commands.get("thinking");
	const ctx = createMockCtx(); // select resolves to undefined
	await blockCmd.handler("", ctx);
	assert.ok(!p.calls.some((c) => c.type === "set"), "cancelling the selector should not change the level");
}

// --- handler: no UI --------------------------------------------------------------
{
	const p = createMockPi();
	thinkingExtension(p);
	const blockCmd = p.commands.get("thinking");
	const ctx = createMockCtx({ hasUI: false });
	await blockCmd.handler("", ctx);
	assert.ok(!p.calls.some((c) => c.type === "set"), "no setThinkingLevel call without UI");
	assert.match(ctx.notify.at(-1).message, /Thinking level: high/);
	assert.match(ctx.notify.at(-1).message, /Usage: \/thinking </);
}

console.log(`thinking: 30 assertions passed`);
