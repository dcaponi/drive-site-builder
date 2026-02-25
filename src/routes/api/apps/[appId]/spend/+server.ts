import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, updateAppInConfig } from '$lib/server/sheets.js';
import { json, error } from '@sveltejs/kit';

// PATCH: update spend_limit_usd and/or is_cutoff
export const PATCH: RequestHandler = async ({ params, locals, request, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const app = await getAppById(auth, params.appId!);
	if (!app) throw error(404, 'App not found');

	const body = await request.json().catch(() => ({}));
	const updates: Record<string, unknown> = {};

	if (body.spend_limit_usd !== undefined) {
		updates.spend_limit_usd = Math.max(0, Number(body.spend_limit_usd) || 0);
	}
	if (body.is_cutoff !== undefined) {
		updates.is_cutoff = Boolean(body.is_cutoff);
	}

	if (Object.keys(updates).length === 0) {
		throw error(400, 'No valid fields to update');
	}

	await updateAppInConfig(auth, app.id, updates as never);
	return json({ ok: true });
};
