import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, lookupSlug, getUserClient } from '$lib/server/rootAuth.js';
import { getAppBySlug } from '$lib/server/sheets.js';
import { verifyAppToken, signAppToken, appCookieName, type AppRole } from '$lib/server/appAuth.js';
import { verifyPassword } from '$lib/server/userAuth.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { error, redirect, fail } from '@sveltejs/kit';

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
		return { app, authed: true, role: 'root' as const, can_chat: true };
	}

	// ── Check for member-level auth (user JWT) ──────────────────────────────
	const userToken = cookies.get(userCookieName(app.id));
	if (userToken) {
		const { valid, userId, email, role, can_chat } = await verifyUserToken(userToken, app.id);
		if (valid) {
			return { app, authed: true, role: role as string, userId, email, can_chat };
		}
	}

	// ── Check for app-owner token ───────────────────────────────────────────
	const appCookieToken = cookies.get(appCookieName(app.id));
	if (appCookieToken) {
		const { valid, role, can_chat } = await verifyAppToken(appCookieToken, app.id);
		if (valid) {
			return { app, authed: true, role, can_chat };
		}
	}

	// ── No password required — public access ────────────────────────────────
	if (!app.app_password) {
		return { app, authed: true, role: 'public' as const, can_chat: false };
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

	return { app, authed: false, role: 'public' as const, can_chat: false };
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
	}
};
