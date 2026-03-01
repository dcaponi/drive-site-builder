import { describe, it, expect, vi } from 'vitest';
import { wrapWithRetry, withRetry, isRetryable } from '../../src/lib/server/retry.js';

// ─── isRetryable ─────────────────────────────────────────────────────────────

describe('isRetryable', () => {
	it('matches code 429', () => {
		expect(isRetryable({ code: 429 })).toBe(true);
	});
	it('matches status 429', () => {
		expect(isRetryable({ status: 429 })).toBe(true);
	});
	it('matches "Quota exceeded" message', () => {
		expect(isRetryable({ message: 'Quota exceeded for quota metric' })).toBe(true);
	});
	it('matches "Rate Limit" message', () => {
		expect(isRetryable({ message: 'Rate Limit Exceeded' })).toBe(true);
	});
	it('does not match generic errors', () => {
		expect(isRetryable({ code: 404, message: 'Not found' })).toBe(false);
	});
	it('does not match non-objects', () => {
		expect(isRetryable(null)).toBe(false);
		expect(isRetryable('string')).toBe(false);
	});
});

// ─── withRetry ───────────────────────────────────────────────────────────────

describe('withRetry', () => {
	it('returns on first success', async () => {
		const fn = vi.fn().mockResolvedValue('ok');
		expect(await withRetry(fn, 3)).toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('retries on 429 then succeeds', async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce({ code: 429 })
			.mockResolvedValue('ok');
		expect(await withRetry(fn, 3)).toBe('ok');
		expect(fn).toHaveBeenCalledTimes(2);
	});

	it('rethrows non-retryable errors immediately', async () => {
		const fn = vi.fn().mockRejectedValue({ code: 404, message: 'Not found' });
		await expect(withRetry(fn, 3)).rejects.toEqual({ code: 404, message: 'Not found' });
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('gives up after max retries', async () => {
		const fn = vi.fn().mockRejectedValue({ code: 429 });
		await expect(withRetry(fn, 2)).rejects.toEqual({ code: 429 });
		// initial + 2 retries = 3 calls
		expect(fn).toHaveBeenCalledTimes(3);
	});
});

// ─── wrapWithRetry: non-configurable property invariant ─────────────────────

describe('wrapWithRetry with non-configurable properties', () => {
	it('wraps an object whose sub-objects have non-configurable properties', () => {
		// Simulate the Google API client structure: client.files is non-configurable
		const files = {
			list: async () => ({ data: { files: [] } }),
			get: async () => ({ data: {} })
		};
		const client: Record<string, unknown> = {};
		Object.defineProperty(client, 'files', {
			value: files,
			writable: false,
			configurable: false,
			enumerable: true
		});

		// This is the exact scenario that broke with the Proxy approach
		const wrapped = wrapWithRetry(client);

		// Must not throw — the old Proxy version threw:
		// "'get' on proxy: property 'files' is a read-only and non-configurable
		//  data property on the proxy target but the proxy did not return its actual value"
		expect(wrapped.files).toBeDefined();
		expect(typeof (wrapped as any).files.list).toBe('function');
		expect(typeof (wrapped as any).files.get).toBe('function');
	});

	it('methods on non-configurable sub-objects return correct results', async () => {
		const files = {
			list: async () => ({ data: { files: [{ id: '1' }] } })
		};
		const client: Record<string, unknown> = {};
		Object.defineProperty(client, 'files', {
			value: files,
			writable: false,
			configurable: false
		});

		const wrapped = wrapWithRetry(client);
		const result = await (wrapped as any).files.list();
		expect(result).toEqual({ data: { files: [{ id: '1' }] } });
	});

	it('retries quota errors on methods of non-configurable sub-objects', async () => {
		let callCount = 0;
		const files = {
			list: async () => {
				callCount++;
				if (callCount === 1) throw { code: 429 };
				return { data: { files: [] } };
			}
		};
		const client: Record<string, unknown> = {};
		Object.defineProperty(client, 'files', {
			value: files,
			writable: false,
			configurable: false
		});

		const wrapped = wrapWithRetry(client);
		const result = await (wrapped as any).files.list();
		expect(result).toEqual({ data: { files: [] } });
		expect(callCount).toBe(2);
	});
});

// ─── wrapWithRetry: prototype methods ───────────────────────────────────────

describe('wrapWithRetry with prototype methods', () => {
	it('wraps methods inherited from prototypes', async () => {
		class Resource {
			async list() {
				return { data: [] };
			}
		}
		const resource = new Resource();
		const client: Record<string, unknown> = {};
		Object.defineProperty(client, 'files', {
			value: resource,
			writable: false,
			configurable: false
		});

		const wrapped = wrapWithRetry(client);
		expect(typeof (wrapped as any).files.list).toBe('function');
		const result = await (wrapped as any).files.list();
		expect(result).toEqual({ data: [] });
	});
});

// ─── wrapWithRetry: sync methods pass through ───────────────────────────────

describe('wrapWithRetry sync methods', () => {
	it('does not wrap synchronous return values', () => {
		const client = {
			getVersion: () => 'v3'
		};
		const wrapped = wrapWithRetry(client);
		expect(wrapped.getVersion()).toBe('v3');
	});
});
