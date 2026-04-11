import type { PageServerLoad } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
import { getAppById, findAppUser } from '$lib/server/sheets.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { error } from '@sveltejs/kit';

function resolveAppAuth(user: SessionUser | null, reg: { ownerEmail: string; rootFolderId: string }, origin: string) {
	const isOwner = user && user.email.toLowerCase() === reg.ownerEmail.toLowerCase();
	const auth = isOwner
		? getAuthedClient(user, origin)
		: getUserClient(reg.ownerEmail, origin);
	return { auth, isOwner, rootFolderId: reg.rootFolderId };
}

export const load: PageServerLoad = async ({ params, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;

	// Resolve via registry — never trust visiting user's rootFolderId
	const reg = lookupApp(params.appId!);
	if (!reg) throw error(503, 'Site temporarily unavailable — please try again later.');

	let auth, isOwner, rootFolderId;
	try {
		({ auth, isOwner, rootFolderId } = resolveAppAuth(user, reg, url.origin));
	} catch {
		throw error(503, 'Site temporarily unavailable — please try again later.');
	}

	let app;
	try {
		app = await getAppById(auth, rootFolderId, params.appId!);
	} catch {
		throw error(503, 'Site temporarily unavailable — please try again later.');
	}
	if (!app) throw error(404, 'App not found');

	// ISOLATION: Only grant 'root' role if visitor IS the app owner
	if (user && isOwner) {
		return { app, authed: true, role: 'root' as const, can_chat: true };
	}

	// ── Check for member-level auth (user JWT) with live can_chat lookup ──
	const userToken = cookies.get(userCookieName(app.id));
	if (userToken) {
		const { valid, userId, email } = await verifyUserToken(userToken, app.id);
		if (valid) {
			const liveUser = await findAppUser(auth, rootFolderId, app.id, email!);
			return { app, authed: true, role: liveUser?.role ?? 'member', userId, email, can_chat: liveUser?.can_chat ?? false };
		}
	}

	// ── Members only check ───────────────────────────────────────────────
	if (app.members_only) {
		return { app, authed: false, role: 'public' as const, can_chat: false, members_only: true };
	}

	// ── Public access ────────────────────────────────────────────────────
	return { app, authed: true, role: 'public' as const, can_chat: false };
};
