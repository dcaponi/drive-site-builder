import type { RequestHandler } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getRootClient, isRootAvailable } from '$lib/server/rootAuth.js';
import { listRecords, createRecord } from '$lib/server/crud.js';
import { verifyUserToken, userCookieName } from '$lib/server/userAuth.js';
import { json } from '@sveltejs/kit';

function resolveAuth(locals: App.Locals, url: URL) {
	const user = locals.user as SessionUser | null;
	if (user) return getAuthedClient(user, url.origin);
	if (isRootAvailable()) return getRootClient(url.origin);
	return null;
}

async function resolveUserId(cookies: Cookies, appId: string): Promise<string | null> {
	const token = cookies.get(userCookieName(appId));
	if (!token) return null;
	const { valid, userId } = await verifyUserToken(token, appId);
	return valid ? userId : null;
}

export const GET: RequestHandler = async ({ params, locals, url, cookies }) => {
	const auth = resolveAuth(locals, url);
	if (!auth) return json({ error: 'Unauthorized' }, { status: 401 });

	const userId = await resolveUserId(cookies, params.appId!);

	try {
		const data = await listRecords(auth, params.appId!, params.table!, userId ?? undefined);
		return json({ data });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request, locals, url, cookies }) => {
	const auth = resolveAuth(locals, url);
	if (!auth) return json({ error: 'Unauthorized' }, { status: 401 });
	const body = await request.json().catch(() => ({}));

	const userId = await resolveUserId(cookies, params.appId!);

	try {
		const data = await createRecord(auth, params.appId!, params.table!, body, userId ?? undefined);
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
