// command-aliases.test.ts - /clear must start a new session, and the
// session-start entry renderer must match the built-in /new banner.
//
// Run: node --experimental-strip-types tests/command-aliases.test.ts
import assert from "node:assert";
import commandAliases from "../extensions/command-aliases.ts";

const commands: Record<string, { description: string; handler: (args: string[], ctx: any) => Promise<void> }> = {};
const renderers = new Map<string, Function>();
const appended: Array<[string, unknown]> = [];
const handlers: Record<string, Function> = {};
let newSessionCalls = 0;

const pi: any = {
	registerCommand(name: string, cmd: { description: string; handler: (args: string[], ctx: any) => Promise<void> }) {
		commands[name] = cmd;
	},
	registerEntryRenderer(type: string, renderer: Function) {
		renderers.set(type, renderer);
	},
	appendEntry(type: string, data?: unknown) {
		appended.push([type, data]);
	},
	on(event: string, handler: Function) {
		handlers[event] = handler;
	},
};

commandAliases(pi);

// Renderer output mirrors the built-in banner: checkmark + accent color.
const theme: any = { fg: (color: string, text: string) => `<${color}>${text}` };
assert.ok(renderers.has("command-aliases/session-start"), "entry renderer registered for command-aliases/session-start");
const rendered = renderers.get("command-aliases/session-start")!({}, {}, theme).render(80);
assert.strictEqual(rendered.length, 3, "one padded line above and below");
assert.strictEqual(rendered[1].trim(), "<accent>✓ New session started");

// session_start handler registered (banner lives there, not in /clear).
assert.ok(handlers["session_start"], "session_start handler registered");

// /clear starts a new session.
assert.strictEqual(commands.clear.description, "Start a new session (clear)");
await commands.clear.handler([], {
	shutdown() {},
	newSession: async () => {
		newSessionCalls++;
		return { cancelled: false };
	},
} as any);
assert.strictEqual(newSessionCalls, 1);

// The replacement session's runtime fires session_start with reason "new";
// that is when the banner entry is appended.
await handlers["session_start"]({ reason: "new" });
assert.deepStrictEqual(appended.map(([type]) => type), ["command-aliases/session-start"]);

// Startup, resume, fork, and reload do not append the banner.
appended.length = 0;
for (const reason of ["startup", "resume", "fork", "reload"]) {
	await handlers["session_start"]({ reason });
}
assert.deepStrictEqual(appended, []);

console.log("command-aliases: 6 assertions passed");
