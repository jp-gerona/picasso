import type { UsageProvider } from "./data.ts";

export type SessionUsage = {
	requests: number;
	input: number;
	output: number;
	cacheRead: number;
};

export function getSessionUsage(entries: Iterable<unknown>, provider: UsageProvider): SessionUsage {
	const result: SessionUsage = { requests: 0, input: 0, output: 0, cacheRead: 0 };
	for (const entry of entries) {
		const message = getAssistantMessage(entry);
		if (!message || message.provider !== provider) {
			continue;
		}
		result.requests += 1;
		result.input += message.usage.input;
		result.output += message.usage.output;
		result.cacheRead += message.usage.cacheRead;
	}
	return result;
}

function getAssistantMessage(entry: unknown):
	| { provider: string; usage: { input: number; output: number; cacheRead: number } }
	| undefined {
	if (!entry || typeof entry !== "object" || !("type" in entry) || entry.type !== "message" || !("message" in entry)) {
		return undefined;
	}
	const message = entry.message;
	if (!message || typeof message !== "object" || !("role" in message) || message.role !== "assistant") {
		return undefined;
	}
	if (!("provider" in message) || typeof message.provider !== "string" || !("usage" in message)) {
		return undefined;
	}
	const usage = message.usage;
	if (
		!usage ||
		typeof usage !== "object" ||
		!("input" in usage) ||
		typeof usage.input !== "number" ||
		!("output" in usage) ||
		typeof usage.output !== "number" ||
		!("cacheRead" in usage) ||
		typeof usage.cacheRead !== "number"
	) {
		return undefined;
	}
	return { provider: message.provider, usage: { input: usage.input, output: usage.output, cacheRead: usage.cacheRead } };
}
