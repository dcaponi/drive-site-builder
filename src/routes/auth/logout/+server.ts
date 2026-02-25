import type { RequestHandler } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/auth.js';

export const GET: RequestHandler = () => {
	return new Response(null, {
		status: 302,
		headers: {
			'Set-Cookie': clearSessionCookie(),
			Location: '/'
		}
	});
};
