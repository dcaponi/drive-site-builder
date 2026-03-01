import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getFirstUserEmail, getUserClient, getUserSession } from '$lib/server/rootAuth.js';
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

	// Find the first available user's credentials for home app resolution
	const firstEmail = getFirstUserEmail();
	if (!firstEmail) throw redirect(302, '/login');

	let auth;
	let rootFolderId: string;
	let isOwner = false;

	if (user && user.email.toLowerCase() === firstEmail.toLowerCase()) {
		auth = getAuthedClient(user, url.origin);
		rootFolderId = user.root_folder_id!;
		isOwner = true;
	} else {
		// Use cached credentials for the primary user
		try {
			auth = getUserClient(firstEmail, url.origin);
		} catch {
			throw redirect(302, '/login');
		}
		// Import getUserSession to get rootFolderId
		const session = getUserSession(firstEmail);
		if (!session?.root_folder_id) throw redirect(302, '/login');
		rootFolderId = session.root_folder_id;
	}

	let homeApp;
	try {
		homeApp = await getHomeApp(auth, rootFolderId!);
	} catch {
		throw redirect(302, '/login');
	}

	if (!homeApp) throw redirect(302, '/login');

	// ── Serve the home app with auth logic (same as serve/[appId]) ──

	// ISOLATION: Only the app owner gets root role
	if (user && isOwner) {
		return { homeApp, authed: true, role: 'root' as const, showUserAuth: false, can_chat: true };
	}

	// Check for user-level auth
	if (homeApp.allowed_domains.length > 0 && homeApp.app_password) {
		const appCookieToken = cookies.get(appCookieName(homeApp.id));
		if (appCookieToken) {
			const { valid, role, can_chat } = await verifyAppToken(appCookieToken, homeApp.id);
			if (valid && role === 'app-owner') {
				return { homeApp, authed: true, role: 'app-owner' as const, showUserAuth: false, can_chat };
			}
		}

		const userToken = cookies.get(userCookieName(homeApp.id));
		if (userToken) {
			const { valid, userId, email } = await verifyUserToken(userToken, homeApp.id);
			if (valid) {
				const owners = (homeApp.app_owners ?? []).map((e) => e.toLowerCase().trim());
				const role: AppRole = owners.includes(email.toLowerCase()) ? 'app-owner' : 'public';
				const can_chat = role === 'app-owner';
				return { homeApp, authed: true, role, showUserAuth: false, userId, email, can_chat };
			}
		}

		return { homeApp, authed: false, role: 'public' as const, showUserAuth: true, can_chat: false };
	}

	// Standard app-password auth
	if (!homeApp.app_password) {
		return { homeApp, authed: true, role: 'public' as const, showUserAuth: false, can_chat: false };
	}

	// Check for token in query param (magic link)
	const tokenParam = url.searchParams.get('token');
	if (tokenParam) {
		const { valid } = await verifyAppToken(tokenParam, homeApp.id);
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
		const { valid, role, can_chat } = await verifyAppToken(cookieToken, homeApp.id);
		if (valid) {
			return { homeApp, authed: true, role, showUserAuth: false, can_chat };
		}
	}

	return { homeApp, authed: false, role: 'public' as const, showUserAuth: false, can_chat: false };
};

export const actions: Actions = {
	login: async ({ url, request, cookies }) => {
		const firstEmail = getFirstUserEmail();
		if (!firstEmail) return fail(503, { error: 'Service unavailable' });

		const auth = getUserClient(firstEmail, url.origin);
		const session = getUserSession(firstEmail);
		if (!session?.root_folder_id) return fail(503, { error: 'Service unavailable' });

		const homeApp = await getHomeApp(auth, session.root_folder_id);
		if (!homeApp) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!verifyPassword(password, homeApp.app_password)) {
			return fail(401, { error: 'Invalid password' });
		}

		const owners = (homeApp.app_owners ?? []).map((e) => e.toLowerCase().trim());
		const role: AppRole =
			owners.length > 0 && owners.includes(email) ? 'app-owner' : 'public';

		const token = await signAppToken(homeApp.id, role);
		cookies.set(appCookieName(homeApp.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 90 * 24 * 3600
		});

		throw redirect(302, '/');
	},

	signup: async ({ url, request, cookies }) => {
		const firstEmail = getFirstUserEmail();
		if (!firstEmail) return fail(503, { error: 'Service unavailable' });

		const auth = getUserClient(firstEmail, url.origin);
		const session = getUserSession(firstEmail);
		if (!session?.root_folder_id) return fail(503, { error: 'Service unavailable' });
		const rootFolderId = session.root_folder_id;

		const homeApp = await getHomeApp(auth, rootFolderId);
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

		const existing = await findAppUser(auth, rootFolderId, homeApp.id, email);
		if (existing) return fail(409, { error: 'An account with this email already exists' });

		const passwordHash = hashPassword(password);
		const userId = await createAppUser(auth, rootFolderId, homeApp.id, email, passwordHash);
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
		const firstEmail = getFirstUserEmail();
		if (!firstEmail) return fail(503, { error: 'Service unavailable' });

		const auth = getUserClient(firstEmail, url.origin);
		const session = getUserSession(firstEmail);
		if (!session?.root_folder_id) return fail(503, { error: 'Service unavailable' });
		const rootFolderId = session.root_folder_id;

		const homeApp = await getHomeApp(auth, rootFolderId);
		if (!homeApp) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required' });

		const appUser = await findAppUser(auth, rootFolderId, homeApp.id, email);
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
		const firstEmail = getFirstUserEmail();
		if (!firstEmail) throw redirect(302, '/');

		try {
			const auth = getUserClient(firstEmail, url.origin);
			const { getUserSession } = await import('$lib/server/rootAuth.js');
			const session = getUserSession(firstEmail);
			if (session?.root_folder_id) {
				const homeApp = await getHomeApp(auth, session.root_folder_id);
				if (homeApp) {
					cookies.delete(userCookieName(homeApp.id), { path: '/' });
				}
			}
		} catch { /* ignore */ }
		throw redirect(302, '/');
	}
};
