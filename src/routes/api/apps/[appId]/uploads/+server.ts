import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
import { getAppById } from '$lib/server/sheets.js';
import { uploadClientFile } from '$lib/server/drive.js';
import { json } from '@sveltejs/kit';

// Decoded file size cap. The JSON body carries base64 (~4/3 larger), so the
// adapter-node BODY_SIZE_LIMIT env var must allow ~45M for this to be reachable.
const MAX_FILE_BYTES = 30 * 1024 * 1024;

const ALLOWED_EXTENSIONS: Record<string, string> = {
	'.zip': 'application/zip'
};

// Zip archives start with "PK" followed by 0x03 (local file header) or 0x05
// (empty archive). Rejects renamed non-zip files that pass the extension check.
function looksLikeZip(buf: Buffer): boolean {
	return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
}

export const POST: RequestHandler = async ({ params, request, locals, url }) => {
	const user = locals.user as SessionUser | null;
	const appId = params.appId!;

	const reg = lookupApp(appId);
	if (!reg) return json({ error: 'App owner must log in first' }, { status: 503 });

	const isOwner = user && user.email.toLowerCase() === reg.ownerEmail.toLowerCase();
	const auth = isOwner
		? getAuthedClient(user, url.origin)
		: getUserClient(reg.ownerEmail, url.origin);

	const app = await getAppById(auth, reg.rootFolderId, appId);
	if (!app) return json({ error: 'App not found' }, { status: 404 });

	const body = (await request.json().catch(() => null)) as {
		filename?: unknown;
		data?: unknown;
		uploader?: unknown;
		note?: unknown;
	} | null;

	if (!body || typeof body.filename !== 'string' || typeof body.data !== 'string') {
		return json({ error: 'filename and data (base64) are required' }, { status: 400 });
	}

	const filename = body.filename.replace(/[^\w.\- ()]/g, '_').slice(0, 128);
	const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
	const mimeType = ALLOWED_EXTENSIONS[ext];
	if (!mimeType) return json({ error: 'Only .zip files are accepted' }, { status: 400 });

	const content = Buffer.from(body.data, 'base64');
	if (content.length === 0) return json({ error: 'File is empty' }, { status: 400 });
	if (content.length > MAX_FILE_BYTES) {
		return json({ error: `File exceeds the ${MAX_FILE_BYTES / 1024 / 1024} MB limit` }, { status: 413 });
	}
	if (!looksLikeZip(content)) return json({ error: 'File is not a valid zip archive' }, { status: 400 });

	const description = [
		`Uploaded via "${app.name}" on ${new Date().toISOString()}`,
		typeof body.uploader === 'string' && body.uploader.trim() ? `From: ${body.uploader.trim().slice(0, 200)}` : null,
		typeof body.note === 'string' && body.note.trim() ? `Note: ${body.note.trim().slice(0, 1000)}` : null
	].filter(Boolean).join('\n');

	try {
		await uploadClientFile(auth, app.folder_id, filename, content, mimeType, description);
		return json({ ok: true }, { status: 201 });
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Upload failed' }, { status: 500 });
	}
};

export const OPTIONS: RequestHandler = () =>
	new Response(null, {
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type'
		}
	});
