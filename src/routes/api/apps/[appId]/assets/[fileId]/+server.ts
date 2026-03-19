import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
import { downloadFileContent } from '$lib/server/drive.js';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser | null;
	const appId = params.appId!;
	const fileId = (params as Record<string, string>).fileId!;

	const reg = lookupApp(appId);
	if (!reg) throw error(503, 'App owner must log in first');

	const isOwner = user && user.email.toLowerCase() === reg.ownerEmail.toLowerCase();
	const auth = isOwner
		? getAuthedClient(user, url.origin)
		: getUserClient(reg.ownerEmail, url.origin);

	try {
		const { data, mimeType } = await downloadFileContent(auth, fileId);

		return new Response(new Uint8Array(data), {
			headers: {
				'Content-Type': mimeType,
				'Cache-Control': 'public, max-age=3600',
				'X-Frame-Options': 'SAMEORIGIN'
			}
		});
	} catch (err) {
		throw error(404, 'Asset not found');
	}
};
