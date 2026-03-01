import type { PageServerLoad } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, lookupSlug, getUserClient } from '$lib/server/rootAuth.js';
import { getAppBySlug, findAppUser } from '$lib/server/sheets.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { error } from '@sveltejs/kit';

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
