import type { OAuth2Client } from 'google-auth-library';
import { getDrive } from './google.js';
import type { AppConfig } from '../types.js';
import { getConfigSheet, updateAppInConfig, addAppToConfig } from './sheets.js';
import { v4 as uuidv4 } from 'uuid';
import { env } from '$env/dynamic/private';

const DRIVE_PARAMS = {
	supportsAllDrives: true,
	includeItemsFromAllDrives: true
} as const;

function getRootFolderId(): string {
	const id = (env.DRIVE_ROOT_FOLDER_ID ?? '').trim();
	if (!id) throw new Error('DRIVE_ROOT_FOLDER_ID env var is not set');
	return id;
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
	clientSlug: string
): Promise<string> {
	const rootId = getRootFolderId();
	const drive = getDrive(auth);

	// List top-level folders
	const res = await drive.files.list({
		q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
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
			parents: [rootId]
		},
		fields: 'id',
		...DRIVE_PARAMS
	});
	return created.data.id!;
}

// ─── Root folder verification ─────────────────────────────────────────────────

export async function verifyRootFolder(
	auth: OAuth2Client
): Promise<{ id: string; name: string }> {
	const rootFolderId = getRootFolderId();
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
				'Check that DRIVE_ROOT_FOLDER_ID is the folder ID (not the full URL) and your account has access.'
		);
	}
}

// ─── List folders inside root ─────────────────────────────────────────────────

export async function listAppFolders(
	auth: OAuth2Client
): Promise<Array<{ id: string; name: string }>> {
	const rootFolderId = getRootFolderId();
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
		app_owners: [],
		allowed_domains: [],
		app_password: '',
		spend_usd: 0,
		spend_limit_usd: 0,
		is_cutoff: false,
		client_slug: clientSlug ?? '',
		app_slug: appSlug ?? toSlug(folderName),
		is_home: false
	};

	await addAppToConfig(auth, app);
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

// ─── Write generated code to a Google Doc ────────────────────────────────────
// Stores the HTML as a Google Doc in the app's own folder.
// On each call the old doc (if any) is deleted and a new one created via
// Drive multipart upload so content is set atomically at creation time —
// much more reliable than patching via the Docs API.

export async function writeGeneratedCode(
	auth: OAuth2Client,
	appId: string,
	appName: string,
	code: string,
	folderId: string,
	existingDocId?: string
): Promise<string> {
	const drive = getDrive(auth);

	// Delete the old doc so we don't accumulate stale files
	if (existingDocId) {
		try {
			await drive.files.delete({ fileId: existingDocId, ...DRIVE_PARAMS });
		} catch {
			// Ignore — it may have already been removed manually
		}
	}

	// Create a fresh Google Doc, uploading the HTML as plain text so Drive
	// stores every character verbatim (no HTML-to-rich-text conversion).
	// We store unminified so Claude can generate accurate diffs; minification
	// happens at serve time in content/+server.ts.
	const created = await drive.files.create({
		requestBody: {
			name: `${appName} — Generated`,
			mimeType: 'application/vnd.google-apps.document',
			parents: [folderId]
		},
		media: {
			mimeType: 'text/plain',
			body: code
		},
		fields: 'id',
		...DRIVE_PARAMS
	});
	const docId = created.data.id!;

	await updateAppInConfig(auth, appId, {
		generated_code_doc_id: docId,
		last_built_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	});

	return docId;
}

// ─── Read generated code from a Google Doc ───────────────────────────────────

export async function readGeneratedCode(auth: OAuth2Client, docId: string): Promise<string> {
	const drive = getDrive(auth);
	const res = await drive.files.export(
		{ fileId: docId, mimeType: 'text/plain' },
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
	name: string,
	clientSlug?: string
): Promise<AppConfig> {
	const drive = getDrive(auth);
	const { google } = await import('googleapis');

	// Determine parent folder
	let parentId: string;
	if (clientSlug) {
		parentId = await findOrCreateClientFolder(auth, clientSlug);
	} else {
		parentId = getRootFolderId();
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
	return registerApp(auth, folderId, name, clientSlug ?? '', toSlug(name));
}

// ─── Append changelog entry to requirements doc ───────────────────────────────

export async function appendToRequirementsDoc(
	auth: OAuth2Client,
	requirementsDocId: string,
	summary: string,
	timestamp: string
): Promise<void> {
	try {
		const { google } = await import('googleapis');
		const docs = google.docs({ version: 'v1', auth });

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
