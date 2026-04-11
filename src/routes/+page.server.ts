import type { PageServerLoad } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getFirstUserEmail, getUserClient, getUserSession } from '$lib/server/rootAuth.js';
import { getHomeApp, findAppUser } from '$lib/server/sheets.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { getCachedHomeApp } from '$lib/server/siteCache.js';

function serveCachedHome() {
	const homeApp = getCachedHomeApp();
	if (!homeApp) return { homeApp: null, unavailable: true };
	if (homeApp.members_only) {
		return { homeApp, authed: false, role: 'public' as const, can_chat: false, members_only: true };
	}
	return { homeApp, authed: true, role: 'public' as const, can_chat: false };
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;

	const firstEmail = getFirstUserEmail();
	if (!firstEmail) {
		return serveCachedHome();
	}

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
			return serveCachedHome();
		}
		const session = getUserSession(firstEmail);
		if (!session?.root_folder_id) {
			return serveCachedHome();
		}
		rootFolderId = session.root_folder_id;
	}

	let homeApp;
	try {
		homeApp = await getHomeApp(auth, rootFolderId!);
	} catch {
		return serveCachedHome();
	}

	if (!homeApp) {
		return serveCachedHome();
	}

	// ── Serve the home app with auth logic ──

	// ISOLATION: Only the app owner gets root role
	if (user && isOwner) {
		return { homeApp, authed: true, role: 'root' as const, can_chat: true };
	}

	// Check for member-level auth (user JWT) with live can_chat lookup
	const userToken = cookies.get(userCookieName(homeApp.id));
	if (userToken) {
		const { valid, userId, email } = await verifyUserToken(userToken, homeApp.id);
		if (valid) {
			const liveUser = await findAppUser(auth, rootFolderId, homeApp.id, email!);
			return { homeApp, authed: true, role: liveUser?.role ?? 'member', userId, email, can_chat: liveUser?.can_chat ?? false };
		}
	}

	// Members only check
	if (homeApp.members_only) {
		return { homeApp, authed: false, role: 'public' as const, can_chat: false, members_only: true };
	}

	// Public access
	return { homeApp, authed: true, role: 'public' as const, can_chat: false };
};
