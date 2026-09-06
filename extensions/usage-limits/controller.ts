import { fetchOpenAiCodexUsage, fetchOpenCodeGoUsage, type UsageFetcher } from "./adapters.ts";
import type { UsageProvider } from "./data.ts";
import type { UsagePanelResult } from "./panel.ts";
import { getSessionUsage } from "./session-stats.ts";

const PROVIDERS: UsageProvider[] = ["openai-codex", "opencode-go"];

export type UsageDependencies = {
	hasCredential(provider: UsageProvider): boolean;
	getApiKey(provider: UsageProvider): Promise<string | undefined>;
	request?: UsageFetcher;
};

export async function collectUsageResults(entries: Iterable<unknown>, dependencies: UsageDependencies): Promise<UsagePanelResult[]> {
	const eligible = PROVIDERS.filter((provider) => dependencies.hasCredential(provider));
	return Promise.all(
		eligible.map(async (provider) => {
			const session = getSessionUsage(entries, provider);
			try {
				const apiKey = await dependencies.getApiKey(provider);
				if (!apiKey) {
					throw new Error("Authentication unavailable");
				}
				const usage =
					provider === "openai-codex"
						? await fetchOpenAiCodexUsage(apiKey, dependencies.request)
						: await fetchOpenCodeGoUsage(apiKey, dependencies.request);
				return { usage, session };
			} catch (error) {
				return { provider, error: errorMessage(error), session };
			}
		}),
	);
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message ? error.message : "Usage request failed";
}
