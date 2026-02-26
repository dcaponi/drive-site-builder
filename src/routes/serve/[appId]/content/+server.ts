import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getRootClient, isRootAvailable } from '$lib/server/rootAuth.js';
import { getAppById } from '$lib/server/sheets.js';
import { readGeneratedCode } from '$lib/server/drive.js';
import { verifyAppToken, appCookieName } from '$lib/server/appAuth.js';
import { error } from '@sveltejs/kit';
import { minify } from 'html-minifier-terser';

async function minifyHtml(code: string): Promise<string> {
	try {
		return await minify(code, {
			collapseWhitespace: true,
			removeComments: true,
			minifyCSS: true,
			minifyJS: true,
			removeAttributeQuotes: true,
			removeRedundantAttributes: true,
			useShortDoctype: true
		});
	} catch {
		return code;
	}
}

export const GET: RequestHandler = async ({ params, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;

	const auth = user
		? getAuthedClient(user, url.origin)
		: isRootAvailable()
			? getRootClient(url.origin)
			: null;

	if (!auth) throw error(503, 'Service unavailable — admin must log in first');

	const app = await getAppById(auth, params.appId!);
	if (!app) throw error(404, 'App not found');

	// For non-Google visitors, verify they have a valid app token
	if (!user && app.app_password) {
		const cookieToken = cookies.get(appCookieName(app.id));
		if (!cookieToken) throw error(401, 'Not authenticated');
		const { valid } = await verifyAppToken(cookieToken, app.id);
		if (!valid) throw error(401, 'Invalid token');
	}

	if (!app.generated_code_doc_id) {
		return new Response(
			`<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#6b7280"><h2>Not built yet</h2><p>Go back and click "Build App".</p></body></html>`,
			{ headers: { 'Content-Type': 'text/html' } }
		);
	}

	const code = await readGeneratedCode(auth, app.generated_code_doc_id);
	const html = await minifyHtml(code);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'X-Frame-Options': 'SAMEORIGIN'
		}
	});
};
