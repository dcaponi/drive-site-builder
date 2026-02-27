import type { Handle } from '@sveltejs/kit';
import { verifySessionToken, getTokenFromCookies } from '$lib/server/auth.js';
import { setUserCredentials } from '$lib/server/rootAuth.js';

export const handle: Handle = async ({ event, resolve }) => {
	const token = getTokenFromCookies(event.request.headers.get('cookie'));
	if (token) {
		const user = await verifySessionToken(token);
		event.locals.user = user;
		if (user) setUserCredentials(user); // Cache for non-Google-authed requests
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
