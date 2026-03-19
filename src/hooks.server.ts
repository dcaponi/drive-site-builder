import type { Handle } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { verifySessionToken, getTokenFromCookies, getAuthedClient } from '$lib/server/auth.js';
import { setUserCredentials, registerAppOwner, registerSlug } from '$lib/server/rootAuth.js';
import { getConfigSheet } from '$lib/server/sheets.js';

// Track which users have had their registry rebuilt this process.
// Once rebuilt, it stays in memory (and on disk) until next deploy.
const _registryRebuilt = new Set<string>();

async function ensureRegistryForUser(user: SessionUser, origin: string): Promise<void> {
	const email = user.email.toLowerCase();
	if (_registryRebuilt.has(email)) return;
	if (!user.root_folder_id) return;

	_registryRebuilt.add(email);

	try {
		const auth = getAuthedClient(user, origin);
		const apps = await getConfigSheet(auth, user.root_folder_id);
		for (const app of apps) {
			registerAppOwner(app.id, user.email, user.root_folder_id);
			if (app.client_slug && app.app_slug) {
				registerSlug(app.client_slug, app.app_slug, app.id);
			}
		}
	} catch {
		// Allow retry on next request if it failed
		_registryRebuilt.delete(email);
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	const token = getTokenFromCookies(event.request.headers.get('cookie'));
	if (token) {
		const user = await verifySessionToken(token);
		event.locals.user = user;
		if (user) {
			setUserCredentials(user);
			await ensureRegistryForUser(user, event.url.origin);
		}
	} else {
		event.locals.user = null;
	}

	const path = event.url.pathname;

	// Admin pages always require Google OAuth
	const isAdminPage = path.startsWith('/dashboard') || path.startsWith('/app/');

	// Root-only API routes (build, credentials, token, feedback delete)
	const isRootOnlyApi =
		path.startsWith('/api/apps/') &&
		(path.endsWith('/build') ||
			path.endsWith('/credentials') ||
			path.endsWith('/token') ||
			path.includes('/feedback/'));

	if ((isAdminPage || isRootOnlyApi) && !event.locals.user) {
		if (path.startsWith('/api/')) {
			return new Response(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}
		return new Response(null, { status: 302, headers: { Location: '/login' } });
	}

	return resolve(event);
};
