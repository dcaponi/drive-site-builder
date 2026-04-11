import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
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

	// Resolve via registry
	const reg = lookupApp(params.appId!);
	if (!reg) throw error(503, 'Site temporarily unavailable — please try again later.');

	let isOwner: boolean;
	let auth;
	let rootFolderId: string;
	try {
		isOwner = !!(user && user.email.toLowerCase() === reg.ownerEmail.toLowerCase());
		auth = isOwner
			? getAuthedClient(user!, url.origin)
			: getUserClient(reg.ownerEmail, url.origin);
		rootFolderId = reg.rootFolderId;
	} catch {
		throw error(503, 'Site temporarily unavailable — please try again later.');
	}

	let app;
	try {
		app = await getAppById(auth, rootFolderId, params.appId!);
	} catch {
		throw error(503, 'Site temporarily unavailable — please try again later.');
	}
	if (!app) throw error(404, 'App not found');

	// For non-owner visitors, verify they have a valid app token
	if (!isOwner && app.app_password) {
		const cookieToken = cookies.get(appCookieName(app.id));
		if (!cookieToken) throw error(401, 'Not authenticated');
		const { valid } = await verifyAppToken(cookieToken, app.id);
		if (!valid) throw error(401, 'Invalid token');
	}

	if (!app.generated_code_doc_id) {
		return new Response(
			`<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#6b7280"><h2>Not built yet</h2><p>Go back and click "Build App".</p></body></html>`,
			{ headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' } }
		);
	}

	let code: string;
	try {
		code = await readGeneratedCode(auth, app.generated_code_doc_id);
	} catch {
		return new Response(
			`<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#6b7280"><h2>App code not found</h2><p>The generated code file may have been deleted. Try rebuilding the app.</p></body></html>`,
			{ headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' } }
		);
	}

	if (!code.trim()) {
		return new Response(
			`<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#6b7280"><h2>App is empty</h2><p>The generated code file is empty. Try rebuilding the app.</p></body></html>`,
			{ headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' } }
		);
	}

	const html = await minifyHtml(code);

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-cache',
			'X-Frame-Options': 'SAMEORIGIN'
		}
	});
};
