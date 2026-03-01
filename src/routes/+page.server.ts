import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getFirstUserEmail, getUserClient, getUserSession } from '$lib/server/rootAuth.js';
import { getHomeApp } from '$lib/server/sheets.js';
import { verifyAppToken, signAppToken, appCookieName, type AppRole } from '$lib/server/appAuth.js';
import { verifyPassword } from '$lib/server/userAuth.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { redirect, fail } from '@sveltejs/kit';

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
		try {
			auth = getUserClient(firstEmail, url.origin);
		} catch {
			throw redirect(302, '/login');
		}
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

	// ── Serve the home app with auth logic ──

	// ISOLATION: Only the app owner gets root role
	if (user && isOwner) {
		return { homeApp, authed: true, role: 'root' as const, can_chat: true };
	}

	// Check for member-level auth (user JWT)
	const userToken = cookies.get(userCookieName(homeApp.id));
	if (userToken) {
		const { valid, userId, email, role, can_chat } = await verifyUserToken(userToken, homeApp.id);
		if (valid) {
			return { homeApp, authed: true, role: role as string, userId, email, can_chat };
		}
	}

	// Check for app-owner token
	const appCookieToken = cookies.get(appCookieName(homeApp.id));
	if (appCookieToken) {
		const { valid, role, can_chat } = await verifyAppToken(appCookieToken, homeApp.id);
		if (valid) {
			return { homeApp, authed: true, role, can_chat };
		}
	}

	// No password required
	if (!homeApp.app_password) {
		return { homeApp, authed: true, role: 'public' as const, can_chat: false };
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

	return { homeApp, authed: false, role: 'public' as const, can_chat: false };
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
	}
};
