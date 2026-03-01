/**
 * Wraps a Google API client with automatic retry + exponential backoff
 * for quota/rate-limit errors (HTTP 429, "Quota exceeded", "Rate Limit").
 *
 * Uses a plain-object wrapper instead of Proxy to avoid invariant violations
 * with non-configurable properties on Google API client objects.
 */

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_JITTER_MS = 500;

export function isRetryable(err: unknown): boolean {
	if (typeof err !== 'object' || err === null) return false;
	const e = err as Record<string, unknown>;
	if (e.code === 429 || e.status === 429) return true;
	const msg = typeof e.message === 'string' ? e.message : '';
	return /quota exceeded|rate limit/i.test(msg);
}

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = MAX_RETRIES): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (attempt >= maxRetries || !isRetryable(err)) throw err;
			const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * MAX_JITTER_MS;
			console.warn(
				`[retry] Google API quota error, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`
			);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
}

/**
 * Chain retry logic onto an already-started promise. On retryable failure,
 * calls `fn` again with exponential backoff. Avoids the double-invocation
 * problem of calling fn() to probe then calling it again inside withRetry.
 */
function retryOnFailure<T>(
	firstAttempt: Promise<T>,
	fn: () => Promise<T>,
	maxRetries = MAX_RETRIES
): Promise<T> {
	let attempt = 0;
	function onError(err: unknown): Promise<T> {
		attempt++;
		if (attempt > maxRetries || !isRetryable(err)) throw err;
		const delay = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * MAX_JITTER_MS;
		console.warn(
			`[retry] Google API quota error, retrying in ${Math.round(delay)}ms (attempt ${attempt}/${maxRetries})`
		);
		return new Promise<void>((r) => setTimeout(r, delay)).then(() => fn().catch(onError));
	}
	return firstAttempt.catch(onError);
}

export function wrapWithRetry<T extends object>(client: T): T {
	const seen = new WeakSet<object>();
	return deepWrap(client, seen);
}

function deepWrap<T extends object>(obj: T, seen: WeakSet<object>): T {
	if (seen.has(obj)) return obj;
	seen.add(obj);

	const wrapper: Record<string | symbol, unknown> = {};

	// Collect all property names including prototype chain
	const keys = new Set<string>();
	let current: object | null = obj;
	while (current && current !== Object.prototype) {
		for (const key of Object.getOwnPropertyNames(current)) {
			keys.add(key);
		}
		current = Object.getPrototypeOf(current);
	}

	for (const key of keys) {
		if (key === 'constructor') continue;

		let value: unknown;
		try {
			value = (obj as Record<string, unknown>)[key];
		} catch {
			continue; // skip getters that throw
		}

		if (typeof value === 'function') {
			const fn = value as (...args: unknown[]) => unknown;
			wrapper[key] = function (...args: unknown[]) {
				const result = fn.apply(obj, args);
				if (
					result &&
					typeof result === 'object' &&
					typeof (result as Promise<unknown>).then === 'function'
				) {
					// Chain retries onto the already-started promise
					return retryOnFailure(
						result as Promise<unknown>,
						() => fn.apply(obj, args) as Promise<unknown>
					);
				}
				return result;
			};
		} else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			wrapper[key] = deepWrap(value as object, seen);
		} else {
			wrapper[key] = value;
		}
	}

	return wrapper as T;
}
