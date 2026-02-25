import type { RequestHandler } from '@sveltejs/kit';
import { getRootClient, isRootAvailable } from '$lib/server/rootAuth.js';
import { getAppById } from '$lib/server/sheets.js';
import { findAppUser, createAppUser } from '$lib/server/sheets.js';
import {
	hashPassword,
	verifyPassword,
	signUserToken,
	verifyUserToken,
	userCookieName
} from '$lib/server/userAuth.js';
import { json } from '@sveltejs/kit';

const COOKIE_MAX_AGE = 90 * 24 * 3600;

function cookieOpts(appId: string) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		maxAge: COOKIE_MAX_AGE
	};
}

export const POST: RequestHandler = async ({ params, request, url, cookies }) => {
	if (!isRootAvailable()) return json({ error: 'Service unavailable' }, { status: 503 });
	const auth = getRootClient(url.origin);
	const appId = params.appId!;

	const app = await getAppById(auth, appId);
	if (!app) return json({ error: 'App not found' }, { status: 404 });

	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const action = String(body.action ?? '').trim();

	// ── Signup ────────────────────────────────────────────────────────────────
	if (action === 'signup') {
		const email = String(body.email ?? '').trim().toLowerCase();
		const password = String(body.password ?? '');

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		// Validate allowed domains
		if (app.allowed_domains.length > 0) {
			const domain = email.split('@')[1] ?? '';
			if (!app.allowed_domains.includes(domain)) {
				return json(
					{ error: `Sign-up is restricted to: ${app.allowed_domains.join(', ')}` },
					{ status: 403 }
				);
			}
		}

		// Check if user already exists
		const existing = await findAppUser(auth, appId, email);
		if (existing) {
			return json({ error: 'An account with this email already exists' }, { status: 409 });
		}

		const passwordHash = hashPassword(password);
		const userId = await createAppUser(auth, appId, email, passwordHash);
		const token = await signUserToken(appId, userId, email);

		cookies.set(userCookieName(appId), token, cookieOpts(appId));
		return json({ userId, email }, { status: 201 });
	}

	// ── Login ─────────────────────────────────────────────────────────────────
	if (action === 'login') {
		const email = String(body.email ?? '').trim().toLowerCase();
		const password = String(body.password ?? '');

		if (!email || !password) {
			return json({ error: 'Email and password are required' }, { status: 400 });
		}

		const user = await findAppUser(auth, appId, email);
		if (!user || !verifyPassword(password, user.password_hash)) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		const token = await signUserToken(appId, user.id, user.email);
		cookies.set(userCookieName(appId), token, cookieOpts(appId));
		return json({ userId: user.id, email: user.email });
	}

	return json({ error: 'Invalid action. Use action: signup or login' }, { status: 400 });
};

export const DELETE: RequestHandler = async ({ params, cookies }) => {
	const appId = params.appId!;
	cookies.delete(userCookieName(appId), { path: '/' });
	return json({ ok: true });
};

export const GET: RequestHandler = async ({ params, cookies }) => {
	const appId = params.appId!;
	const token = cookies.get(userCookieName(appId));
	if (!token) return json({ error: 'Not authenticated' }, { status: 401 });

	const { valid, userId, email } = await verifyUserToken(token, appId);
	if (!valid) return json({ error: 'Invalid or expired token' }, { status: 401 });

	return json({ userId, email });
};
