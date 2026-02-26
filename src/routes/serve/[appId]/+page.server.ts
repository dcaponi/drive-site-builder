import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getRootClient, isRootAvailable } from '$lib/server/rootAuth.js';
import { getAppById } from '$lib/server/sheets.js';
import { findAppUser, createAppUser } from '$lib/server/sheets.js';
import { verifyAppToken, signAppToken, appCookieName, type AppRole } from '$lib/server/appAuth.js';
import {
	hashPassword,
	verifyPassword,
	signUserToken,
	verifyUserToken,
	userCookieName
} from '$lib/server/userAuth.js';
import { error, redirect, fail } from '@sveltejs/kit';

const USER_COOKIE_MAX_AGE = 90 * 24 * 3600;

export const load: PageServerLoad = async ({ params, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;

	// Prefer the visitor's own Google credentials; fall back to cached root credentials
	const auth = user
		? getAuthedClient(user, url.origin)
		: isRootAvailable()
			? getRootClient(url.origin)
			: null;

	if (!auth) throw error(503, 'Service unavailable — admin must log in first');

	const app = await getAppById(auth, params.appId!);
	if (!app) throw error(404, 'App not found');

	// Root user (Google OAuth) always has full access
	if (user) {
		return { app, authed: true, role: 'root' as const, showUserAuth: false };
	}

	// ── Check for user-level auth (end-user sign-up/login) ──────────────────
	// Only applies when allowed_domains is set (indicating app has a user system)
	if (app.allowed_domains.length > 0 && app.app_password) {
		// First check app-owner cookie (has priority)
		const appCookieToken = cookies.get(appCookieName(app.id));
		if (appCookieToken) {
			const { valid, role } = await verifyAppToken(appCookieToken, app.id);
			if (valid && role === 'app-owner') {
				return { app, authed: true, role: 'app-owner' as const, showUserAuth: false };
			}
		}

		// Check user cookie
		const userToken = cookies.get(userCookieName(app.id));
		if (userToken) {
			const { valid, userId, email } = await verifyUserToken(userToken, app.id);
			if (valid) {
				const owners = (app.app_owners ?? []).map((e) => e.toLowerCase().trim());
				const role: AppRole = owners.includes(email.toLowerCase()) ? 'app-owner' : 'public';
				return {
					app,
					authed: true,
					role,
					showUserAuth: false,
					userId,
					email
				};
			}
		}

		// Not authed — show user sign-up/login
		return { app, authed: false, role: 'public' as const, showUserAuth: true };
	}

	// ── Standard app-password auth ──────────────────────────────────────────
	if (!app.app_password) {
		// Public app — anyone can view (no chat bubble)
		return { app, authed: true, role: 'public' as const, showUserAuth: false };
	}

	// Check for token in query param (magic link)
	const tokenParam = url.searchParams.get('token');
	if (tokenParam) {
		const { valid, role } = await verifyAppToken(tokenParam, app.id);
		if (valid) {
			cookies.set(appCookieName(app.id), tokenParam, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 90 * 24 * 3600
			});
			throw redirect(302, `/serve/${app.id}`);
		}
	}

	// Check cookie
	const cookieToken = cookies.get(appCookieName(app.id));
	if (cookieToken) {
		const { valid, role } = await verifyAppToken(cookieToken, app.id);
		if (valid) {
			return { app, authed: true, role, showUserAuth: false };
		}
	}

	// Not authed — show login form
	return { app, authed: false, role: 'public' as const, showUserAuth: false };
};

export const actions: Actions = {
	login: async ({ params, url, request, cookies }) => {
		if (!isRootAvailable()) return fail(503, { error: 'Service unavailable' });

		const auth = getRootClient(url.origin);
		const app = await getAppById(auth, params.appId!);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!verifyPassword(password, app.app_password)) {
			return fail(401, { error: 'Invalid password' });
		}

		// Determine role: email in app_owners list → app-owner; otherwise public
		const owners = (app.app_owners ?? []).map((e) => e.toLowerCase().trim());
		const role: AppRole =
			owners.length > 0 && owners.includes(email) ? 'app-owner' : 'public';

		const token = await signAppToken(app.id, role);
		cookies.set(appCookieName(app.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 90 * 24 * 3600
		});

		throw redirect(302, `/serve/${app.id}`);
	},

	signup: async ({ params, url, request, cookies }) => {
		if (!isRootAvailable()) return fail(503, { error: 'Service unavailable' });

		const auth = getRootClient(url.origin);
		const app = await getAppById(auth, params.appId!);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm_password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required' });
		if (password !== confirm) return fail(400, { error: 'Passwords do not match' });

		// Validate domain
		if (app.allowed_domains.length > 0) {
			const domain = email.split('@')[1] ?? '';
			if (!app.allowed_domains.includes(domain)) {
				return fail(403, {
					error: `Sign-up is restricted to: ${app.allowed_domains.join(', ')}`
				});
			}
		}

		// Check if already exists
		const existing = await findAppUser(auth, params.appId!, email);
		if (existing) return fail(409, { error: 'An account with this email already exists' });

		const passwordHash = hashPassword(password);
		const userId = await createAppUser(auth, params.appId!, email, passwordHash);
		const token = await signUserToken(params.appId!, userId, email);

		cookies.set(userCookieName(params.appId!), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});

		throw redirect(302, `/serve/${params.appId!}`);
	},

	userLogin: async ({ params, url, request, cookies }) => {
		if (!isRootAvailable()) return fail(503, { error: 'Service unavailable' });

		const auth = getRootClient(url.origin);
		const app = await getAppById(auth, params.appId!);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required' });

		const appUser = await findAppUser(auth, params.appId!, email);
		if (!appUser || !verifyPassword(password, appUser.password_hash)) {
			return fail(401, { error: 'Invalid email or password' });
		}

		const token = await signUserToken(params.appId!, appUser.id, appUser.email);
		cookies.set(userCookieName(params.appId!), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});

		throw redirect(302, `/serve/${params.appId!}`);
	},

	userLogout: async ({ params, cookies }) => {
		cookies.delete(userCookieName(params.appId!), { path: '/' });
		throw redirect(302, `/serve/${params.appId!}`);
	}
};
