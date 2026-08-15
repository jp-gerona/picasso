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

export default function commandAliases(pi: ExtensionAPI) {
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
			await ctx.newSession({
				withSession: async (ctx) => {
					ctx.ui.notify("New session started", "info");
				},
			});
		},
	});
}
