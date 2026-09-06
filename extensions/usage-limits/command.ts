import { collectUsageResults, type UsageDependencies } from "./controller.ts";
import type { UsageProvider } from "./data.ts";
import type { UsagePanelResult } from "./panel.ts";

const PROVIDERS: UsageProvider[] = ["openai-codex", "opencode-go"];

type UsageCommandDependencies = Pick<UsageDependencies, "hasCredential" | "getApiKey" | "request">;

type UsageCommandContext = {
	mode: string;
	ui: { notify(message: string, type?: "info" | "warning" | "error"): void };
	sessionManager: { getBranch(): Iterable<unknown> };
	modelRegistry: { getProviderAuth(provider: string): Promise<{ auth: { apiKey?: string } } | undefined> };
};

type UsageExtensionApi = {
	registerCommand(
		name: string,
		command: { description: string; handler(args: string, ctx: UsageCommandContext): Promise<void> },
	): void;
};

export function registerUsageCommand(
	pi: UsageExtensionApi,
	showPanel: (ui: UsageCommandContext["ui"], results: UsagePanelResult[]) => void,
	overrides: Partial<UsageCommandDependencies> = {},
) {
	pi.registerCommand("usage", {
		description: "Show authenticated subscription usage limits",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("Usage dashboard is available in TUI mode only", "warning");
				return;
			}
			if (!overrides.hasCredential) {
				throw new Error("Usage command requires credential discovery");
			}
			if (!PROVIDERS.some((provider) => overrides.hasCredential!(provider))) {
				ctx.ui.notify("No supported authenticated providers", "warning");
				return;
			}
			const results = await collectUsageResults(ctx.sessionManager.getBranch(), {
				hasCredential: overrides.hasCredential,
				getApiKey:
					overrides.getApiKey ??
					(async (provider) => {
						const auth = await ctx.modelRegistry.getProviderAuth(provider);
						return auth?.auth.apiKey;
					}),
				request: overrides.request,
			});
			showPanel(ctx.ui, results);
		},
	});
}
