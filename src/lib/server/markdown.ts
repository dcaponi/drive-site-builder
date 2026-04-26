// Reading .md files from Drive. Markdown is the agreed page-content format
// for nested routes; we look for files whose name ends in .md and which are
// stored as text/markdown or text/plain.

import type { OAuth2Client } from 'google-auth-library';
import type { drive_v3 } from 'googleapis';
import { getDrive } from './google.js';

const DRIVE_PARAMS = {
	supportsAllDrives: true,
	includeItemsFromAllDrives: true
} as const;

const MD_MIME_TYPES = new Set([
	'text/markdown',
	'text/x-markdown',
	'text/plain',
	'application/octet-stream'
]);

/** Match a file from a folder listing whose stem (name without .md) matches `pattern`. */
export function findMarkdownFile(
	files: drive_v3.Schema$File[],
	pattern: RegExp
): drive_v3.Schema$File | null {
	for (const f of files) {
		const name = f.name ?? '';
		if (!name.toLowerCase().endsWith('.md')) continue;
		if (!MD_MIME_TYPES.has(f.mimeType ?? '')) continue;
		const stem = name.slice(0, -3);
		if (pattern.test(stem)) return f;
	}
	return null;
}

export async function readMarkdownFile(
	auth: OAuth2Client,
	fileId: string
): Promise<string> {
	const drive = getDrive(auth);
	const res = await drive.files.get(
		{ fileId, alt: 'media', ...DRIVE_PARAMS },
		{ responseType: 'text' }
	);
	return ((res.data as string) ?? '').trim();
}
