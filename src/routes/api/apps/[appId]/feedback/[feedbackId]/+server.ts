import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { deleteConversationEntry } from '$lib/server/sheets.js';
import { json } from '@sveltejs/kit';

export const DELETE: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const ok = await deleteConversationEntry(auth, params.feedbackId!);
	return json({ ok });
};
