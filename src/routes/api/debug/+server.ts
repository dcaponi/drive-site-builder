import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getDrive } from '$lib/server/google.js';
import { json } from '@sveltejs/kit';

/**
 * GET /api/debug
 * Diagnostic endpoint — remove before going to production.
 * Shows env var state, token scopes, and Drive connectivity.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	const user = locals.user as SessionUser | null;
	if (!user) return json({ error: 'Not signed in' }, { status: 401 });

	const folderId = (process.env.DRIVE_ROOT_FOLDER_ID ?? '').trim();

	const result: Record<string, unknown> = {
		env: {
			DRIVE_ROOT_FOLDER_ID_raw: process.env.DRIVE_ROOT_FOLDER_ID,
			DRIVE_ROOT_FOLDER_ID_trimmed: folderId,
			DRIVE_ROOT_FOLDER_ID_length: folderId.length,
			GOOGLE_CLIENT_ID_set: !!process.env.GOOGLE_CLIENT_ID,
		},
		session: {
			email: user.email,
			access_token_prefix: user.access_token?.slice(0, 20) + '…',
			has_refresh_token: !!user.refresh_token,
			expiry_date: new Date(user.expiry_date).toISOString(),
			token_expired: Date.now() > user.expiry_date,
		},
	};

	// 1. Check what scopes the token actually has
	try {
		const tokenInfoRes = await fetch(
			`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${user.access_token}`
		);
		const tokenInfo = await tokenInfoRes.json();
		result.token_info = tokenInfo;
	} catch (e) {
		result.token_info_error = String(e);
	}

	// 2. Try a basic Drive call — list root-level files (no folder filter)
	const auth = getAuthedClient(user, url.origin);
	const drive = getDrive(auth);

	try {
		const rootRes = await drive.files.list({
			pageSize: 5,
			fields: 'files(id,name,mimeType)',
			supportsAllDrives: true,
			includeItemsFromAllDrives: true,
		});
		result.drive_root_sample = rootRes.data.files;
	} catch (e) {
		result.drive_root_error = e instanceof Error ? e.message : String(e);
	}

	// 3. Try files.get on the specific folder ID
	if (folderId) {
		try {
			const folderRes = await drive.files.get({
				fileId: folderId,
				fields: 'id,name,mimeType,owners',
				supportsAllDrives: true,
			});
			result.folder_get = folderRes.data;
		} catch (e) {
			result.folder_get_error = e instanceof Error ? e.message : String(e);
		}
	} else {
		result.folder_get_error = 'DRIVE_ROOT_FOLDER_ID is empty after trim';
	}

	return json(result, { headers: { 'Content-Type': 'application/json' } });
};
