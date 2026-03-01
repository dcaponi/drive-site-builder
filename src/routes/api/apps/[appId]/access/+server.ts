import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, updateAppInConfig } from '$lib/server/sheets.js';
import { json, error } from '@sveltejs/kit';

export const PATCH: RequestHandler = async ({ params, locals, request, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const app = await getAppById(auth, rootFolderId, params.appId!);
	if (!app) throw error(404, 'App not found');

	const body = await request.json();
	const updates: Partial<{ members_only: boolean; allowed_domains: string[] }> = {};

	if (typeof body.members_only === 'boolean') {
		updates.members_only = body.members_only;
	}
	if (Array.isArray(body.allowed_domains)) {
		updates.allowed_domains = body.allowed_domains.map((d: string) => d.trim()).filter(Boolean);
	}

	await updateAppInConfig(auth, rootFolderId, app.id, updates);

	return json({ ok: true });
};
