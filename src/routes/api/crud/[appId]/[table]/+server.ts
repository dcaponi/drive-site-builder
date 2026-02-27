import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
import { listRecords, createRecord } from '$lib/server/crud.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { json } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';

function resolveAuth(user: SessionUser | null, reg: { ownerEmail: string; rootFolderId: string }, origin: string) {
	const isOwner = user && user.email.toLowerCase() === reg.ownerEmail.toLowerCase();
	return isOwner
		? getAuthedClient(user, origin)
		: getUserClient(reg.ownerEmail, origin);
}

async function resolveUserId(cookies: Cookies, appId: string): Promise<string | null> {
	const token = cookies.get(userCookieName(appId));
	if (!token) return null;
	const { valid, userId } = await verifyUserToken(token, appId);
	return valid ? userId : null;
}

export const GET: RequestHandler = async ({ params, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;
	const reg = lookupApp(params.appId!);
	if (!reg) return json({ error: 'App owner must log in first' }, { status: 503 });

	const auth = resolveAuth(user, reg, url.origin);
	const userId = await resolveUserId(cookies, params.appId!);

	try {
		const data = await listRecords(auth, reg.rootFolderId, params.appId!, params.table!, userId ?? undefined);
		return json({ data });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;
	const reg = lookupApp(params.appId!);
	if (!reg) return json({ error: 'App owner must log in first' }, { status: 503 });

	const auth = resolveAuth(user, reg, url.origin);
	const body = await request.json().catch(() => ({}));
	const userId = await resolveUserId(cookies, params.appId!);

	try {
		const data = await createRecord(auth, reg.rootFolderId, params.appId!, params.table!, body, userId ?? undefined);
		return json({ data }, { status: 201 });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
	}
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
