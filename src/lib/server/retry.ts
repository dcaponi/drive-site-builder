/**
 * Wraps a Google API client with automatic retry + exponential backoff
 * for quota/rate-limit errors (HTTP 429, "Quota exceeded", "Rate Limit").
 */

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_JITTER_MS = 500;

function isRetryable(err: unknown): boolean {
	if (typeof err !== 'object' || err === null) return false;
	const e = err as Record<string, unknown>;
	if (e.code === 429 || e.status === 429) return true;
	const msg = typeof e.message === 'string' ? e.message : '';
	return /quota exceeded|rate limit/i.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= MAX_RETRIES || !isRetryable(err)) throw err;
			const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * MAX_JITTER_MS;
			console.warn(
				`[retry] Google API quota error, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${MAX_RETRIES})`
			);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
}

export function wrapWithRetry<T extends object>(client: T): T {
	return new Proxy(client, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof value === 'function') {
				return function (this: unknown, ...args: unknown[]) {
					const result = value.apply(target, args);
					if (result && typeof result === 'object' && typeof result.then === 'function') {
						return withRetry(() => value.apply(target, args));
					}
					return result;
				};
			}
			if (value && typeof value === 'object') {
				return wrapWithRetry(value as object);
			}
			return value;
		}
	}) as T;
}
