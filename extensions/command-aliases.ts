/**
 * command-aliases - convenience aliases for built-in slash commands.
 *
 * Registers discoverable aliases so they show up in the `/` command list and
 * behave exactly like their canonical built-ins:
 *
 *   /exit, /bye  ->  /quit   (graceful shutdown)
 *   /clear       ->  /new    (start a new session)
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// Custom entry rendered to mirror the built-in /new banner (theme accent +
// checkmark); entries are TUI-only, so this never reaches the LLM context.
const SESSION_START_ENTRY = "command-aliases/session-start";

export default function commandAliases(pi: ExtensionAPI) {
	pi.registerEntryRenderer(SESSION_START_ENTRY, (_entry, _options, theme) => {
		return new Text(theme.fg("accent", "✓ New session started"), 1, 1);
	});
	pi.registerCommand("exit", {
		description: "Quit pi (exit)",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});

	pi.registerCommand("bye", {
		description: "Quit pi (bye)",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});

	pi.registerCommand("clear", {
		description: "Start a new session (clear)",
		handler: async (_args, ctx) => {
			// Captured ctx/pi are stale after session replacement, so post-replacement
			// work (the banner entry) happens in the session_start handler below.
			await ctx.newSession();
		},
	});

	// Fired by the fresh runtime of the replacement session; this instance's pi
	// is valid here. Only banner explicit new sessions, not startup/resume/fork.
	pi.on("session_start", async (event) => {
		if (event.reason !== "new") {
			return;
		}
		pi.appendEntry(SESSION_START_ENTRY);
	});
}
