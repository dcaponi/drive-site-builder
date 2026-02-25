import type { RequestHandler } from '@sveltejs/kit';
import { getAuthUrl } from '$lib/server/auth.js';

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	return new Response(null, {
		status: 302,
		headers: { Location: getAuthUrl(origin) }
	});
};
