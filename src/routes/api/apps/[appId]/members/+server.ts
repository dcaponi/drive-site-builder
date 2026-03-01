import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { listAppUsers, createAppUser, updateAppUser, deleteAppUser } from '$lib/server/sheets.js';
import { json, error } from '@sveltejs/kit';

function getAuthedUser(locals: App.Locals): SessionUser {
	const user = locals.user as SessionUser | null;
	if (!user) throw error(401, 'Authentication required');
	return user;
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const user = getAuthedUser(locals);
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const members = await listAppUsers(auth, rootFolderId, params.appId!);

	// Omit password_hash, return has_password boolean
	const sanitized = members.map(({ password_hash, ...rest }) => ({
		...rest,
		has_password: !!password_hash
	}));

	return json(sanitized);
};

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	const user = getAuthedUser(locals);
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const email = String(body.email ?? '').trim().toLowerCase();
	const role = body.role === 'owner' ? 'owner' as const : 'member' as const;
	const canChat = body.can_chat === true || (role === 'owner' ? true : false);

	if (!email) return json({ error: 'Email is required' }, { status: 400 });

	const userId = await createAppUser(auth, rootFolderId, params.appId!, email, '', role, canChat);

	return json({ userId, email, role, can_chat: canChat }, { status: 201 });
};

export const PATCH: RequestHandler = async ({ params, request, locals, url }) => {
	const user = getAuthedUser(locals);
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const userId = String(body.userId ?? '');

	if (!userId) return json({ error: 'userId is required' }, { status: 400 });

	const updates: Parameters<typeof updateAppUser>[4] = {};
	if (body.role !== undefined) updates.role = body.role === 'owner' ? 'owner' : 'member';
	if (body.can_chat !== undefined) updates.can_chat = body.can_chat === true;

	const ok = await updateAppUser(auth, rootFolderId, params.appId!, userId, updates);
	if (!ok) return json({ error: 'User not found' }, { status: 404 });

	return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, request, locals, url }) => {
	const user = getAuthedUser(locals);
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const body = await request.json().catch(() => ({})) as Record<string, unknown>;
	const userId = String(body.userId ?? '');

	if (!userId) return json({ error: 'userId is required' }, { status: 400 });

	const ok = await deleteAppUser(auth, rootFolderId, params.appId!, userId);
	if (!ok) return json({ error: 'User not found' }, { status: 404 });

	return json({ ok: true });
};
