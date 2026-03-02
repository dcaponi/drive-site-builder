import type { OAuth2Client } from 'google-auth-library';
import { getDrive, getDocs } from './google.js';
import type { AppConfig } from '../types.js';
import { getConfigSheet, updateAppInConfig, addAppToConfig } from './sheets.js';
import { v4 as uuidv4 } from 'uuid';
import { env } from '$env/dynamic/private';

const DRIVE_PARAMS = {
	supportsAllDrives: true,
	includeItemsFromAllDrives: true
} as const;

const ROOT_FOLDER_NAME = 'drive-app-builder';

// ─── User root folder provisioning ───────────────────────────────────────────

/**
 * Ensure the user has a root folder for their apps.
 * - If email matches the primary owner (first in ALLOWED_EMAILS), return DRIVE_ROOT_FOLDER_ID.
 * - Otherwise, search for a "drive-app-builder" folder in their Drive root; create if not found.
 */
export async function ensureUserRootFolder(
	auth: OAuth2Client,
	email: string
): Promise<string> {
	// Check if this user is the primary owner
	const raw = env.ALLOWED_EMAILS ?? env.ALLOWED_EMAIL ?? '';
	const allowedEmails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
	const primaryEmail = allowedEmails[0] ?? '';

	if (primaryEmail && email.toLowerCase() === primaryEmail) {
		const envId = (env.DRIVE_ROOT_FOLDER_ID ?? '').trim();
		if (envId) return envId;
	}

	// Search user's Drive for the root folder
	const drive = getDrive(auth);
	const res = await drive.files.list({
		q: `name = '${ROOT_FOLDER_NAME}' and 'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
		fields: 'files(id,name)',
		pageSize: 1
	});

	if (res.data.files?.length) {
		return res.data.files[0].id!;
	}

	// Create the root folder
	const created = await drive.files.create({
		requestBody: {
			name: ROOT_FOLDER_NAME,
			mimeType: 'application/vnd.google-apps.folder'
		},
		fields: 'id'
	});
	return created.data.id!;
}

// ─── Slug helpers ─────────────────────────────────────────────────────────────

export function toSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// ─── Client folder helpers ────────────────────────────────────────────────────

export async function findOrCreateClientFolder(
	auth: OAuth2Client,
	rootFolderId: string,
	clientSlug: string
): Promise<string> {
	const drive = getDrive(auth);

	// List top-level folders
	const res = await drive.files.list({
		q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
		fields: 'files(id,name)',
		...DRIVE_PARAMS
	});

	const folders = res.data.files ?? [];
	const match = folders.find((f) => toSlug(f.name ?? '') === clientSlug);
	if (match) return match.id!;

	// Create new client folder
	const created = await drive.files.create({
		requestBody: {
			name: clientSlug,
			mimeType: 'application/vnd.google-apps.folder',
			parents: [rootFolderId]
		},
		fields: 'id',
		...DRIVE_PARAMS
	});
	return created.data.id!;
}

// ─── Root folder verification ─────────────────────────────────────────────────

export async function verifyRootFolder(
	auth: OAuth2Client,
	rootFolderId: string
): Promise<{ id: string; name: string }> {
	const drive = getDrive(auth);
	try {
		const res = await drive.files.get({
			fileId: rootFolderId,
			fields: 'id,name,mimeType',
			...DRIVE_PARAMS
		});
		return { id: res.data.id!, name: res.data.name! };
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		throw new Error(
			`Cannot access Drive folder "${rootFolderId}": ${msg}. ` +
				'Check that the folder ID is correct and your account has access.'
		);
	}
}

// ─── List folders inside root ─────────────────────────────────────────────────

export async function listAppFolders(
	auth: OAuth2Client,
	rootFolderId: string
): Promise<Array<{ id: string; name: string }>> {
	const drive = getDrive(auth);
	const res = await drive.files.list({
		q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
		fields: 'files(id,name)',
		orderBy: 'name',
		...DRIVE_PARAMS
	});
	return (res.data.files ?? []).map((f) => ({ id: f.id!, name: f.name! }));
}

// ─── Scan a folder for requirements doc + database sheet ─────────────────────

export interface FolderScan {
	requirementsDocId: string | null;
	databaseSheetId: string | null;
}

export async function scanAppFolder(auth: OAuth2Client, folderId: string): Promise<FolderScan> {
	const drive = getDrive(auth);
	const res = await drive.files.list({
		q: `'${folderId}' in parents and trashed = false`,
		fields: 'files(id,name,mimeType)',
		orderBy: 'name',
		...DRIVE_PARAMS
	});

	const files = res.data.files ?? [];
	const docs = files.filter((f) => f.mimeType === 'application/vnd.google-apps.document');
	const sheets = files.filter((f) => f.mimeType === 'application/vnd.google-apps.spreadsheet');

	const reqDoc = docs.find((f) => /requirements?/i.test(f.name ?? '')) ?? docs[0] ?? null;
	const dbSheet = sheets.find((f) => /database|db/i.test(f.name ?? '')) ?? sheets[0] ?? null;

	return {
		requirementsDocId: reqDoc?.id ?? null,
		databaseSheetId: dbSheet?.id ?? null
	};
}

// ─── Register a new app from a folder ────────────────────────────────────────

export async function registerApp(
	auth: OAuth2Client,
	rootFolderId: string,
	folderId: string,
	folderName: string,
	clientSlug?: string,
	appSlug?: string
): Promise<AppConfig> {
	const { requirementsDocId, databaseSheetId } = await scanAppFolder(auth, folderId);

	if (!requirementsDocId) throw new Error('No Google Doc found in folder (requirements doc)');
	if (!databaseSheetId) throw new Error('No Google Sheet found in folder (database)');

	const now = new Date().toISOString();
	const app: AppConfig = {
		id: uuidv4(),
		name: folderName,
		folder_id: folderId,
		requirements_doc_id: requirementsDocId,
		database_sheet_id: databaseSheetId,
		generated_code_doc_id: '',
		created_at: now,
		updated_at: now,
		last_built_at: '',
		members_only: false,
		allowed_domains: [],
		spend_usd: 0,
		spend_limit_usd: 0,
		is_cutoff: false,
		client_slug: clientSlug ?? '',
		app_slug: appSlug ?? toSlug(folderName),
		is_home: false
	};

	await addAppToConfig(auth, rootFolderId, app);
	return app;
}

// ─── Read requirements doc as plain text ─────────────────────────────────────

export async function readRequirementsDoc(auth: OAuth2Client, docId: string): Promise<string> {
	const drive = getDrive(auth);
	const res = await drive.files.export(
		{ fileId: docId, mimeType: 'text/plain' },
		{ responseType: 'text' }
	);
	return (res.data as string) ?? '';
}

// ─── Write generated code to Drive ───────────────────────────────────────────
// Stores HTML as a plain-text file (not a Google Doc). Uses text/plain as the
// stored mimeType so Google Drive never tries to interpret the HTML content.
// If the existing file is a legacy Google Doc, it's deleted and replaced with
// a plain file — Google Docs can't be reliably updated via media upload.

export async function writeGeneratedCode(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string,
	appName: string,
	code: string,
	folderId: string,
	existingDocId?: string
): Promise<string> {
	const drive = getDrive(auth);

	if (existingDocId) {
		// Check if existing file is a Google Doc (legacy) or plain file
		let isGoogleDoc = false;
		try {
			const meta = await drive.files.get({ fileId: existingDocId, fields: 'mimeType', ...DRIVE_PARAMS });
			isGoogleDoc = meta.data.mimeType === 'application/vnd.google-apps.document';
		} catch {
			// File doesn't exist — will create a new one below
		}

		if (isGoogleDoc) {
			// Google Docs corrupt HTML on update — delete and replace with plain file
			try { await drive.files.delete({ fileId: existingDocId, ...DRIVE_PARAMS }); } catch { /* ignore */ }
		} else {
			// Plain file — update in-place
			try {
				await drive.files.update({
					fileId: existingDocId,
					media: { mimeType: 'text/plain', body: code },
					...DRIVE_PARAMS
				});
				await updateAppInConfig(auth, rootFolderId, appId, {
					last_built_at: new Date().toISOString(),
					updated_at: new Date().toISOString()
				});
				return existingDocId;
			} catch {
				// File missing or inaccessible — delete orphan before creating new
				try { await drive.files.delete({ fileId: existingDocId, ...DRIVE_PARAMS }); } catch { /* ignore */ }
			}
		}
	}

	const created = await drive.files.create({
		requestBody: {
			name: `${appName} — Generated.html`,
			mimeType: 'text/plain',
			parents: [folderId]
		},
		media: { mimeType: 'text/plain', body: code },
		fields: 'id',
		...DRIVE_PARAMS
	});
	const docId = created.data.id!;

	await updateAppInConfig(auth, rootFolderId, appId, {
		generated_code_doc_id: docId,
		last_built_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	});

	return docId;
}

// ─── Read generated code from Drive ──────────────────────────────────────────

export async function readGeneratedCode(auth: OAuth2Client, fileId: string): Promise<string> {
	const drive = getDrive(auth);

	const meta = await drive.files.get({ fileId, fields: 'mimeType', ...DRIVE_PARAMS });
	const mimeType = meta.data.mimeType ?? '';

	if (mimeType === 'application/vnd.google-apps.document') {
		// Legacy Google Doc — the HTML was stored as plain text content inside
		// the doc, so exporting as text/plain returns the original HTML string.
		const res = await drive.files.export(
			{ fileId, mimeType: 'text/plain' },
			{ responseType: 'text' }
		);
		return ((res.data as string) ?? '').trim();
	}

	// Plain file — download directly
	const res = await drive.files.get(
		{ fileId, alt: 'media', ...DRIVE_PARAMS },
		{ responseType: 'text' }
	);
	return ((res.data as string) ?? '').trim();
}

// ─── Create scaffolded app (folder + doc + sheet) ────────────────────────────

const REQUIREMENTS_TEMPLATE = `# App Requirements

## App Description
Describe what this app does and its main purpose.

## Features
List the key features this app should have.

## User Roles
Describe the different types of users and their permissions.

## Design Notes
Any design preferences, color schemes, or UI requirements.

## Data Model
Describe the tables and data this app will manage.
`;

export async function createAppScaffold(
	auth: OAuth2Client,
	rootFolderId: string,
	name: string,
	clientSlug?: string
): Promise<AppConfig> {
	const drive = getDrive(auth);

	// Determine parent folder
	let parentId: string;
	if (clientSlug) {
		parentId = await findOrCreateClientFolder(auth, rootFolderId, clientSlug);
	} else {
		parentId = rootFolderId;
	}

	// 1. Create folder
	const folder = await drive.files.create({
		requestBody: {
			name,
			mimeType: 'application/vnd.google-apps.folder',
			parents: [parentId]
		},
		fields: 'id',
		...DRIVE_PARAMS
	});
	const folderId = folder.data.id!;

	// 2. Create requirements doc (upload as plain text → auto-converts to Google Doc)
	await drive.files.create({
		requestBody: {
			name: `${name} — Requirements`,
			mimeType: 'application/vnd.google-apps.document',
			parents: [folderId]
		},
		media: {
			mimeType: 'text/plain',
			body: REQUIREMENTS_TEMPLATE
		},
		fields: 'id',
		...DRIVE_PARAMS
	});

	// 3. Create blank database spreadsheet
	await drive.files.create({
		requestBody: {
			name: `${name} — Database`,
			mimeType: 'application/vnd.google-apps.spreadsheet',
			parents: [folderId]
		},
		fields: 'id',
		...DRIVE_PARAMS
	});

	// 4. Register and return AppConfig
	return registerApp(auth, rootFolderId, folderId, name, clientSlug ?? '', toSlug(name));
}

// ─── Append changelog entry to requirements doc ───────────────────────────────

export async function appendToRequirementsDoc(
	auth: OAuth2Client,
	requirementsDocId: string,
	summary: string,
	timestamp: string
): Promise<void> {
	try {
		const docs = getDocs(auth);

		// Get current document to find end index
		const doc = await docs.documents.get({ documentId: requirementsDocId });
		const body = doc.data.body;
		const endIndex = body?.content?.at(-1)?.endIndex ?? 1;

		// Insert text just before the final newline (endIndex - 1)
		const insertAt = Math.max(endIndex - 1, 1);
		const text = `\n---\n${timestamp} Change: ${summary}`;

		await docs.documents.batchUpdate({
			documentId: requirementsDocId,
			requestBody: {
				requests: [
					{
						insertText: {
							location: { index: insertAt },
							text
						}
					}
				]
			}
		});
	} catch {
		// Non-fatal — changelog append failure should not break the update
	}
}
