import type { PageServerLoad } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, lookupSlug, getUserClient } from '$lib/server/rootAuth.js';
import { getAppBySlug, findAppUser } from '$lib/server/sheets.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { getCachedAppBySlug } from '$lib/server/siteCache.js';
import { getDocIdForPath } from '$lib/server/drive.js';
import { normalizePath } from '$lib/server/siteTree.js';
import { error } from '@sveltejs/kit';

function resolveReg(clientSlug: string, appSlug: string) {
	const appId = lookupSlug(clientSlug, appSlug);
	if (!appId) return null;
	const reg = lookupApp(appId);
	if (!reg) return null;
	return { ...reg, appId };
}

function pathFromParam(raw: string | undefined): string {
	return normalizePath(raw ?? '');
}

function serveCached(clientSlug: string, appSlug: string, subPath: string) {
	const app = getCachedAppBySlug(clientSlug, appSlug);
	if (!app) throw error(503, 'Site temporarily unavailable — please try again later.');
	const hasPage = !!getDocIdForPath(app.generated_code_doc_id, subPath);
	if (app.members_only) {
		return { app, authed: false, role: 'public' as const, can_chat: false, members_only: true, subPath, hasPage };
	}
	return { app, authed: true, role: 'public' as const, can_chat: false, subPath, hasPage };
}

export const load: PageServerLoad = async ({ params, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;
	const subPath = pathFromParam(params.subPath);

	const resolved = resolveReg(params.clientSlug, params.appSlug);
	if (!resolved) return serveCached(params.clientSlug, params.appSlug, subPath);

	let isOwner: boolean;
	let auth;
	let rootFolderId: string;
	try {
		isOwner = !!(user && user.email.toLowerCase() === resolved.ownerEmail.toLowerCase());
		auth = isOwner
			? getAuthedClient(user!, url.origin)
			: getUserClient(resolved.ownerEmail, url.origin);
		rootFolderId = resolved.rootFolderId;
	} catch {
		return serveCached(params.clientSlug, params.appSlug, subPath);
	}

	let app;
	try {
		app = await getAppBySlug(auth, rootFolderId, params.clientSlug, params.appSlug);
	} catch {
		return serveCached(params.clientSlug, params.appSlug, subPath);
	}
	if (!app) throw error(404, 'App not found');

	const hasPage = !!getDocIdForPath(app.generated_code_doc_id, subPath);

	if (user && isOwner) {
		return { app, authed: true, role: 'root' as const, can_chat: true, subPath, hasPage };
	}

	const userToken = cookies.get(userCookieName(app.id));
	if (userToken) {
		const { valid, userId, email } = await verifyUserToken(userToken, app.id);
		if (valid) {
			const liveUser = await findAppUser(auth, rootFolderId, app.id, email!);
			return {
				app,
				authed: true,
				role: liveUser?.role ?? 'member',
				userId,
				email,
				can_chat: liveUser?.can_chat ?? false,
				subPath,
				hasPage
			};
		}
	}

	if (app.members_only) {
		return { app, authed: false, role: 'public' as const, can_chat: false, members_only: true, subPath, hasPage };
	}

	return { app, authed: true, role: 'public' as const, can_chat: false, subPath, hasPage };
};
