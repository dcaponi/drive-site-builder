import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getRootClient, isRootAvailable } from '$lib/server/rootAuth.js';
import { getAppById, getHomeApp } from '$lib/server/sheets.js';
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

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;

	if (user) throw redirect(302, '/dashboard');

	// Try to find and serve the home app
	const auth = isRootAvailable() ? getRootClient(url.origin) : null;
	if (!auth) throw redirect(302, '/login');

	let homeApp;
	try {
		homeApp = await getHomeApp(auth);
	} catch {
		throw redirect(302, '/login');
	}

	if (!homeApp) throw redirect(302, '/login');

	// ── Serve the home app with auth logic (same as serve/[appId]) ──

	// Check for user-level auth
	if (homeApp.allowed_domains.length > 0 && homeApp.app_password) {
		const appCookieToken = cookies.get(appCookieName(homeApp.id));
		if (appCookieToken) {
			const { valid, role } = await verifyAppToken(appCookieToken, homeApp.id, homeApp.app_password);
			if (valid && role === 'app-owner') {
				return { homeApp, authed: true, role: 'app-owner' as const, showUserAuth: false };
			}
		}

		const userToken = cookies.get(userCookieName(homeApp.id));
		if (userToken) {
			const { valid, userId, email } = await verifyUserToken(userToken, homeApp.id);
			if (valid) {
				const owners = (homeApp.app_owners ?? []).map((e) => e.toLowerCase().trim());
				const role: AppRole = owners.includes(email.toLowerCase()) ? 'app-owner' : 'public';
				return { homeApp, authed: true, role, showUserAuth: false, userId, email };
			}
		}

		return { homeApp, authed: false, role: 'public' as const, showUserAuth: true };
	}

	// Standard app-password auth
	if (!homeApp.app_password) {
		return { homeApp, authed: true, role: 'public' as const, showUserAuth: false };
	}

	// Check for token in query param (magic link)
	const tokenParam = url.searchParams.get('token');
	if (tokenParam) {
		const { valid } = await verifyAppToken(tokenParam, homeApp.id, homeApp.app_password);
		if (valid) {
			cookies.set(appCookieName(homeApp.id), tokenParam, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 90 * 24 * 3600
			});
			throw redirect(302, '/');
		}
	}

	// Check cookie
	const cookieToken = cookies.get(appCookieName(homeApp.id));
	if (cookieToken) {
		const { valid, role } = await verifyAppToken(cookieToken, homeApp.id, homeApp.app_password);
		if (valid) {
			return { homeApp, authed: true, role, showUserAuth: false };
		}
	}

	return { homeApp, authed: false, role: 'public' as const, showUserAuth: false };
};

export const actions: Actions = {
	login: async ({ url, request, cookies }) => {
		if (!isRootAvailable()) return fail(503, { error: 'Service unavailable' });

		const auth = getRootClient(url.origin);
		const homeApp = await getHomeApp(auth);
		if (!homeApp) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (password !== homeApp.app_password) {
			return fail(401, { error: 'Invalid password' });
		}

		const owners = (homeApp.app_owners ?? []).map((e) => e.toLowerCase().trim());
		const role: AppRole =
			owners.length > 0 && owners.includes(email) ? 'app-owner' : 'public';

		const token = await signAppToken(homeApp.id, homeApp.app_password, role);
		cookies.set(appCookieName(homeApp.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 90 * 24 * 3600
		});

		throw redirect(302, '/');
	},

	signup: async ({ url, request, cookies }) => {
		if (!isRootAvailable()) return fail(503, { error: 'Service unavailable' });

		const auth = getRootClient(url.origin);
		const homeApp = await getHomeApp(auth);
		if (!homeApp) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm_password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required' });
		if (password !== confirm) return fail(400, { error: 'Passwords do not match' });

		if (homeApp.allowed_domains.length > 0) {
			const domain = email.split('@')[1] ?? '';
			if (!homeApp.allowed_domains.includes(domain)) {
				return fail(403, {
					error: `Sign-up is restricted to: ${homeApp.allowed_domains.join(', ')}`
				});
			}
		}

		const existing = await findAppUser(auth, homeApp.id, email);
		if (existing) return fail(409, { error: 'An account with this email already exists' });

		const passwordHash = hashPassword(password);
		const userId = await createAppUser(auth, homeApp.id, email, passwordHash);
		const token = await signUserToken(homeApp.id, userId, email);

		cookies.set(userCookieName(homeApp.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});

		throw redirect(302, '/');
	},

	userLogin: async ({ url, request, cookies }) => {
		if (!isRootAvailable()) return fail(503, { error: 'Service unavailable' });

		const auth = getRootClient(url.origin);
		const homeApp = await getHomeApp(auth);
		if (!homeApp) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required' });

		const appUser = await findAppUser(auth, homeApp.id, email);
		if (!appUser || !verifyPassword(password, appUser.password_hash)) {
			return fail(401, { error: 'Invalid email or password' });
		}

		const token = await signUserToken(homeApp.id, appUser.id, appUser.email);
		cookies.set(userCookieName(homeApp.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});

		throw redirect(302, '/');
	},

	userLogout: async ({ url, cookies }) => {
		if (!isRootAvailable()) return fail(503, { error: 'Service unavailable' });

		const auth = getRootClient(url.origin);
		const homeApp = await getHomeApp(auth);
		if (!homeApp) throw redirect(302, '/');

		cookies.delete(userCookieName(homeApp.id), { path: '/' });
		throw redirect(302, '/');
	}
};
