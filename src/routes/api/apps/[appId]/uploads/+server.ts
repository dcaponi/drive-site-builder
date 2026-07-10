import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
import { getAppById } from '$lib/server/sheets.js';
import { uploadClientFile } from '$lib/server/drive.js';
import { json } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import type { AppConfig } from '$lib/types.js';

// Google Drive's per-file ceiling (5 TB). The effective transport ceiling is
// the adapter-node BODY_SIZE_LIMIT env var (default 5G via the start script) —
// raise that to accept larger single-request uploads, no code change needed.
const DRIVE_MAX_FILE_BYTES = 5 * 1024 ** 4;

// The legacy JSON path buffers the whole base64 payload in memory, so it keeps
// a small cap. New clients send raw bytes and are only bounded by Drive/transport.
const JSON_MAX_FILE_BYTES = 30 * 1024 * 1024;

const ALLOWED_EXTENSIONS: Record<string, string> = {
	'.zip': 'application/zip'
};

// Zip archives start with "PK" followed by 0x03 (local file header) or 0x05
// (empty archive). Rejects renamed non-zip files that pass the extension check.
function looksLikeZip(buf: Buffer): boolean {
	return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
}

class UploadError extends Error {
	constructor(public status: number, message: string) {
		super(message);
	}
}

function sanitizeFilename(raw: string): { filename: string; mimeType: string } {
	const filename = raw.replace(/[^\w.\- ()]/g, '_').slice(0, 128);
	const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
	const mimeType = ALLOWED_EXTENSIONS[ext];
	if (!mimeType) throw new UploadError(400, 'Only .zip files are accepted');
	return { filename, mimeType };
}

function buildDescription(appName: string, uploader: unknown, note: unknown): string {
	return [
		`Uploaded via "${appName}" on ${new Date().toISOString()}`,
		typeof uploader === 'string' && uploader.trim() ? `From: ${uploader.trim().slice(0, 200)}` : null,
		typeof note === 'string' && note.trim() ? `Note: ${note.trim().slice(0, 1000)}` : null
	].filter(Boolean).join('\n');
}

// ─── Raw streaming path (preferred) ──────────────────────────────────────────
// Body is the file bytes; metadata travels in query params. The stream is
// checked for zip magic bytes up front, counted against the Drive ceiling,
// and piped to Drive without ever holding the file in memory.

// Consume whatever the Drive consumer (or an early validation failure) left
// unread, so the HTTP response can be delivered over a cleanly-finished
// connection. Bounded: past the cap we cancel instead of eating bandwidth.
async function drainRemainder(iter: AsyncIterator<Uint8Array>, maxBytes = 64 * 1024 * 1024): Promise<void> {
	let drained = 0;
	try {
		while (drained < maxBytes) {
			const { value, done } = await iter.next();
			if (done) return;
			drained += value.length;
		}
		await iter.return?.();
	} catch {
		// Stream already errored/destroyed — nothing to clean up
	}
}

async function handleRawUpload(
	auth: Parameters<typeof uploadClientFile>[0],
	app: AppConfig,
	request: Request,
	url: URL
): Promise<Response> {
	if (!request.body) return json({ error: 'Request body is empty' }, { status: 400 });

	const source = Readable.fromWeb(request.body as unknown as WebReadableStream);
	const iter = source[Symbol.asyncIterator]();

	try {
		const declared = Number(request.headers.get('content-length') ?? '0');
		if (declared > DRIVE_MAX_FILE_BYTES) {
			throw new UploadError(413, 'File exceeds the Google Drive 5 TB per-file limit');
		}
		const { filename, mimeType } = sanitizeFilename(url.searchParams.get('filename') ?? '');

		// Validate the zip magic bytes eagerly, before anything is sent to Drive —
		// a lazy check inside the stream only runs if the consumer reads it.
		let head = Buffer.alloc(0);
		while (head.length < 4) {
			const { value, done } = await iter.next();
			if (done) break;
			head = Buffer.concat([head, Buffer.isBuffer(value) ? value : Buffer.from(value)]);
		}
		if (!looksLikeZip(head)) throw new UploadError(400, 'File is empty or not a valid zip archive');

		let total = head.length;
		async function* guarded() {
			yield head;
			while (true) {
				const { value, done } = await iter.next();
				if (done) return;
				const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
				total += buf.length;
				if (total > DRIVE_MAX_FILE_BYTES) {
					throw new UploadError(413, 'File exceeds the Google Drive 5 TB per-file limit');
				}
				yield buf;
			}
		}

		const description = buildDescription(app.name, url.searchParams.get('uploader'), url.searchParams.get('note'));

		await uploadClientFile(auth, app.folder_id, filename, Readable.from(guarded()), mimeType, description);
		return json({ ok: true }, { status: 201 });
	} finally {
		await drainRemainder(iter);
	}
}

// ─── Legacy JSON path ─────────────────────────────────────────────────────────
// { filename, data (base64), uploader?, note? } — kept so apps generated
// against the original API keep working. Capped small because it buffers.

async function handleJsonUpload(
	auth: Parameters<typeof uploadClientFile>[0],
	app: AppConfig,
	request: Request
): Promise<Response> {
	// A body over BODY_SIZE_LIMIT errors the request stream mid-read, so a
	// failed parse here usually means "too large", not "malformed".
	let body: { filename?: unknown; data?: unknown; uploader?: unknown; note?: unknown };
	try {
		body = await request.json();
	} catch {
		return json(
			{ error: 'Upload was rejected before it completed — the file may exceed the server request limit. Try a smaller file.' },
			{ status: 413 }
		);
	}

	if (typeof body.filename !== 'string' || typeof body.data !== 'string') {
		return json({ error: 'filename and data (base64) are required' }, { status: 400 });
	}

	const { filename, mimeType } = sanitizeFilename(body.filename);

	const content = Buffer.from(body.data, 'base64');
	if (content.length === 0) return json({ error: 'File is empty' }, { status: 400 });
	if (content.length > JSON_MAX_FILE_BYTES) {
		return json(
			{ error: `Base64 uploads are limited to ${JSON_MAX_FILE_BYTES / 1024 / 1024} MB — send the raw file bytes for larger files` },
			{ status: 413 }
		);
	}
	if (!looksLikeZip(content)) return json({ error: 'File is not a valid zip archive' }, { status: 400 });

	const description = buildDescription(app.name, body.uploader, body.note);

	await uploadClientFile(auth, app.folder_id, filename, content, mimeType, description);
	return json({ ok: true }, { status: 201 });
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

	const contentType = request.headers.get('content-type') ?? '';

	try {
		return contentType.includes('application/json')
			? await handleJsonUpload(auth, app, request)
			: await handleRawUpload(auth, app, request, url);
	} catch (err) {
		if (err instanceof UploadError) return json({ error: err.message }, { status: err.status });
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
