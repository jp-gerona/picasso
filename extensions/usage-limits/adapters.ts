import { parseOpenAiCodexUsage, parseOpenCodeGoUsage, type ProviderUsage } from "./data.ts";

export type UsageFetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function fetchOpenAiCodexUsage(accessToken: string, request: UsageFetcher = fetch): Promise<ProviderUsage> {
	const accountId = getOpenAiAccountId(accessToken);
	const response = await request("https://chatgpt.com/backend-api/wham/usage", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"chatgpt-account-id": accountId,
		},
	});
	if (!response.ok) {
		throw new Error(`Usage request failed (${response.status})`);
	}
	return parseOpenAiCodexUsage(await response.json());
}

export async function fetchOpenCodeGoUsage(apiKey: string, request: UsageFetcher = fetch): Promise<ProviderUsage> {
	const response = await request("https://opencode.ai/zen/go/v1/usage", {
		headers: { Authorization: `Bearer ${apiKey}` },
	});
	if (!response.ok) {
		throw new Error(`Usage request failed (${response.status})`);
	}
	return parseOpenCodeGoUsage(await response.json());
}

function getOpenAiAccountId(accessToken: string): string {
	try {
		const payload = accessToken.split(".")[1];
		if (!payload) {
			throw new Error();
		}
		const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
			"https://api.openai.com/auth"?: { chatgpt_account_id?: unknown };
		};
		const accountId = claims["https://api.openai.com/auth"]?.chatgpt_account_id;
		if (typeof accountId !== "string" || accountId.length === 0) {
			throw new Error();
		}
		return accountId;
	} catch {
		throw new Error("OpenAI Codex credential has no account ID");
	}
}
