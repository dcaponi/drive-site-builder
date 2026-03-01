import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, lookupSlug, getUserClient } from '$lib/server/rootAuth.js';
import { getAppById, getAppBySlug } from '$lib/server/sheets.js';
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

/** Resolve the app's owner info via the slug registry, then the app registry. */
function resolveReg(clientSlug: string, appSlug: string) {
	const appId = lookupSlug(clientSlug, appSlug);
	if (!appId) return null;
	const reg = lookupApp(appId);
	if (!reg) return null;
	return { ...reg, appId };
}

export const load: PageServerLoad = async ({ params, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;

	const resolved = resolveReg(params.clientSlug, params.appSlug);
	if (!resolved) throw error(503, 'App owner must log in first');

	const isOwner = user && user.email.toLowerCase() === resolved.ownerEmail.toLowerCase();
	const auth = isOwner
		? getAuthedClient(user, url.origin)
		: getUserClient(resolved.ownerEmail, url.origin);
	const rootFolderId = resolved.rootFolderId;

	const app = await getAppBySlug(auth, rootFolderId, params.clientSlug, params.appSlug);
	if (!app) throw error(404, 'App not found');

	// ISOLATION: Only grant 'root' role if visitor IS the app owner
	if (user && isOwner) {
		return { app, authed: true, role: 'root' as const, showUserAuth: false, can_chat: true };
	}

	// ── Check for user-level auth ──
	if (app.allowed_domains.length > 0 && app.app_password) {
		const appCookieToken = cookies.get(appCookieName(app.id));
		if (appCookieToken) {
			const { valid, role, can_chat } = await verifyAppToken(appCookieToken, app.id);
			if (valid && role === 'app-owner') {
				return { app, authed: true, role: 'app-owner' as const, showUserAuth: false, can_chat };
			}
		}

		const userToken = cookies.get(userCookieName(app.id));
		if (userToken) {
			const { valid, userId, email } = await verifyUserToken(userToken, app.id);
			if (valid) {
				const owners = (app.app_owners ?? []).map((e) => e.toLowerCase().trim());
				const role: AppRole = owners.includes(email.toLowerCase()) ? 'app-owner' : 'public';
				const can_chat = role === 'app-owner';
				return { app, authed: true, role, showUserAuth: false, userId, email, can_chat };
			}
		}

		return { app, authed: false, role: 'public' as const, showUserAuth: true, can_chat: false };
	}

	// ── Standard app-password auth ──
	if (!app.app_password) {
		return { app, authed: true, role: 'public' as const, showUserAuth: false, can_chat: false };
	}

	// Check for token in query param (magic link)
	const tokenParam = url.searchParams.get('token');
	if (tokenParam) {
		const { valid } = await verifyAppToken(tokenParam, app.id);
		if (valid) {
			cookies.set(appCookieName(app.id), tokenParam, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: 90 * 24 * 3600
			});
			throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
		}
	}

	// Check cookie
	const cookieToken = cookies.get(appCookieName(app.id));
	if (cookieToken) {
		const { valid, role, can_chat } = await verifyAppToken(cookieToken, app.id);
		if (valid) {
			return { app, authed: true, role, showUserAuth: false, can_chat };
		}
	}

	return { app, authed: false, role: 'public' as const, showUserAuth: false, can_chat: false };
};

export const actions: Actions = {
	login: async ({ params, url, request, cookies }) => {
		const resolved = resolveReg(params.clientSlug, params.appSlug);
		if (!resolved) return fail(503, { error: 'App owner must log in first' });

		const auth = getUserClient(resolved.ownerEmail, url.origin);
		const app = await getAppBySlug(auth, resolved.rootFolderId, params.clientSlug, params.appSlug);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!verifyPassword(password, app.app_password)) {
			return fail(401, { error: 'Invalid password' });
		}

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

		throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
	},

	signup: async ({ params, url, request, cookies }) => {
		const resolved = resolveReg(params.clientSlug, params.appSlug);
		if (!resolved) return fail(503, { error: 'App owner must log in first' });

		const auth = getUserClient(resolved.ownerEmail, url.origin);
		const app = await getAppBySlug(auth, resolved.rootFolderId, params.clientSlug, params.appSlug);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const confirm = String(data.get('confirm_password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required' });
		if (password !== confirm) return fail(400, { error: 'Passwords do not match' });

		if (app.allowed_domains.length > 0) {
			const domain = email.split('@')[1] ?? '';
			if (!app.allowed_domains.includes(domain)) {
				return fail(403, {
					error: `Sign-up is restricted to: ${app.allowed_domains.join(', ')}`
				});
			}
		}

		const existing = await findAppUser(auth, resolved.rootFolderId, app.id, email);
		if (existing) return fail(409, { error: 'An account with this email already exists' });

		const passwordHash = hashPassword(password);
		const userId = await createAppUser(auth, resolved.rootFolderId, app.id, email, passwordHash);
		const token = await signUserToken(app.id, userId, email);

		cookies.set(userCookieName(app.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});

		throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
	},

	userLogin: async ({ params, url, request, cookies }) => {
		const resolved = resolveReg(params.clientSlug, params.appSlug);
		if (!resolved) return fail(503, { error: 'App owner must log in first' });

		const auth = getUserClient(resolved.ownerEmail, url.origin);
		const app = await getAppBySlug(auth, resolved.rootFolderId, params.clientSlug, params.appSlug);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');

		if (!email || !password) return fail(400, { error: 'Email and password are required' });

		const appUser = await findAppUser(auth, resolved.rootFolderId, app.id, email);
		if (!appUser || !verifyPassword(password, appUser.password_hash)) {
			return fail(401, { error: 'Invalid email or password' });
		}

		const token = await signUserToken(app.id, appUser.id, appUser.email);
		cookies.set(userCookieName(app.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});

		throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
	},

	userLogout: async ({ params, url, cookies }) => {
		const resolved = resolveReg(params.clientSlug, params.appSlug);
		if (resolved) {
			const auth = getUserClient(resolved.ownerEmail, url.origin);
			const app = await getAppBySlug(auth, resolved.rootFolderId, params.clientSlug, params.appSlug);
			if (app) {
				cookies.delete(userCookieName(app.id), { path: '/' });
			}
		}
		throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
	}
};
