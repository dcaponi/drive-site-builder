import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
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
	const appId = params.appId!;

	// Resolve via registry
	const reg = lookupApp(appId);
	if (!reg) return json({ error: 'App owner must log in first' }, { status: 503 });

	const auth = getUserClient(reg.ownerEmail, url.origin);
	const rootFolderId = reg.rootFolderId;

	const app = await getAppById(auth, rootFolderId, appId);
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
		const existing = await findAppUser(auth, rootFolderId, appId, email);
		if (existing) {
			return json({ error: 'An account with this email already exists' }, { status: 409 });
		}

		const passwordHash = hashPassword(password);
		const userId = await createAppUser(auth, rootFolderId, appId, email, passwordHash, 'member', false);
		const token = await signUserToken(appId, userId, email, 'member', false);

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

		const appUser = await findAppUser(auth, rootFolderId, appId, email);
		if (!appUser || !verifyPassword(password, appUser.password_hash)) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		const token = await signUserToken(appId, appUser.id, appUser.email, appUser.role, appUser.can_chat);
		cookies.set(userCookieName(appId), token, cookieOpts(appId));
		return json({ userId: appUser.id, email: appUser.email });
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

	const { valid, userId, email, role, can_chat } = await verifyUserToken(token, appId);
	if (!valid) return json({ error: 'Invalid or expired token' }, { status: 401 });

	return json({ userId, email, role, can_chat });
};
