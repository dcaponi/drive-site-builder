import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, updateAppInConfig } from '$lib/server/sheets.js';
import { json, error } from '@sveltejs/kit';

// PUT: set credentials
export const PUT: RequestHandler = async ({ params, locals, request, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const app = await getAppById(auth, params.appId!);
	if (!app) throw error(404, 'App not found');

	const body = await request.json();
	const { owners, password, allowed_domains } = body as {
		owners: string[];
		password: string;
		allowed_domains?: string[];
	};

	if (!Array.isArray(owners) || !password) {
		throw error(400, 'owners and password are required');
	}

	await updateAppInConfig(auth, app.id, {
		app_owners: owners.map((e) => e.trim()).filter(Boolean),
		app_password: password,
		allowed_domains: (allowed_domains ?? []).map((d) => d.trim()).filter(Boolean)
	});

	return json({ ok: true });
};

// DELETE: clear credentials
export const DELETE: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const app = await getAppById(auth, params.appId!);
	if (!app) throw error(404, 'App not found');

	await updateAppInConfig(auth, app.id, {
		app_owners: [],
		app_password: ''
	});

	return json({ ok: true });
};
