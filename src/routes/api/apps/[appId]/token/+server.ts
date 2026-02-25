import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById } from '$lib/server/sheets.js';
import { signAppToken } from '$lib/server/appAuth.js';
import { json, error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const app = await getAppById(auth, params.appId!);
	if (!app) throw error(404, 'App not found');

	if (!app.app_password) {
		throw error(400, 'No password set on this app');
	}

	const token = await signAppToken(app.id, app.app_password, 'public');
	const magicLink = `${url.origin}/serve/${app.id}?token=${token}`;

	return json({ token, magicLink });
};
