import type { OAuth2Client } from 'google-auth-library';
import { getSheets, getDrive } from './google.js';
import type { AppConfig, TableSchema, ColumnDef, CrudRecord, Conversation } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

const DRIVE_PARAMS = {
	supportsAllDrives: true,
	includeItemsFromAllDrives: true
} as const;

// ─── Config sheet helpers ─────────────────────────────────────────────────────
// The config sheet lives at root level and is looked up by name

const CONFIG_SHEET_NAME = '_config';
const CONVERSATIONS_SHEET_NAME = '_conversations';

// Keyed by rootFolderId to prevent cross-tenant cache poisoning
const _configSheetIds = new Map<string, string>();
const _conversationsSheetIds = new Map<string, string>();

async function findOrCreateSheet(
	auth: OAuth2Client,
	rootFolderId: string,
	name: string,
	cache: Map<string, string>
): Promise<string> {
	const cached = cache.get(rootFolderId);
	if (cached) return cached;

	const drive = getDrive(auth);

	// Try to find existing
	const res = await drive.files.list({
		q: `name = '${name}' and '${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
		fields: 'files(id)',
		pageSize: 1,
		...DRIVE_PARAMS
	});

	if (res.data.files?.length) {
		const id = res.data.files[0].id!;
		cache.set(rootFolderId, id);
		return id;
	}

	// Create new spreadsheet in root folder
	const created = await drive.files.create({
		requestBody: {
			name,
			mimeType: 'application/vnd.google-apps.spreadsheet',
			parents: [rootFolderId]
		},
		fields: 'id',
		...DRIVE_PARAMS
	});
	const id = created.data.id!;
	cache.set(rootFolderId, id);
	return id;
}

export function clearSheetCaches(): void {
	_configSheetIds.clear();
	_conversationsSheetIds.clear();
}

async function getConfigSheetId(auth: OAuth2Client, rootFolderId: string): Promise<string> {
	return findOrCreateSheet(auth, rootFolderId, CONFIG_SHEET_NAME, _configSheetIds);
}

async function getConversationsSheetId(auth: OAuth2Client, rootFolderId: string): Promise<string> {
	return findOrCreateSheet(auth, rootFolderId, CONVERSATIONS_SHEET_NAME, _conversationsSheetIds);
}

// Ensure a named tab exists in a spreadsheet.
// If the spreadsheet only has the default "Sheet1", rename it; otherwise add a new tab.
async function ensureSheetTab(
	auth: OAuth2Client,
	spreadsheetId: string,
	tabName: string
): Promise<void> {
	const sheets = getSheets(auth);
	const meta = await sheets.spreadsheets.get({ spreadsheetId });
	const existing = meta.data.sheets ?? [];

	if (existing.some((s) => s.properties?.title === tabName)) return;

	const sheet1 = existing.find((s) => s.properties?.title === 'Sheet1');
	if (sheet1?.properties?.sheetId !== undefined) {
		await sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: {
				requests: [
					{
						updateSheetProperties: {
							properties: { sheetId: sheet1.properties.sheetId, title: tabName },
							fields: 'title'
						}
					}
				]
			}
		});
	} else {
		await sheets.spreadsheets.batchUpdate({
			spreadsheetId,
			requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
		});
	}
}

// ─── App Config CRUD ──────────────────────────────────────────────────────────

const APP_HEADERS = [
	'id',
	'name',
	'folder_id',
	'requirements_doc_id',
	'database_sheet_id',
	'generated_code_doc_id',
	'created_at',
	'updated_at',
	'last_built_at',
	'app_owners',
	'app_password',
	'allowed_domains',
	'spend_usd',
	'spend_limit_usd',
	'is_cutoff',
	'client_slug',
	'app_slug',
	'is_home'
] as const;

function serializeConfigValue(key: string, value: unknown): string {
	if (Array.isArray(value)) return value.join(',');
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	if (typeof value === 'number') return String(value);
	return String(value ?? '');
}

export async function getConfigSheet(auth: OAuth2Client, rootFolderId: string): Promise<AppConfig[]> {
	const sheetId = await getConfigSheetId(auth, rootFolderId);
	await ensureSheetTab(auth, sheetId, 'apps');
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: 'apps!A:R'
	});

	const rows = res.data.values ?? [];

	// Write (or update) the header row whenever it doesn't exactly match APP_HEADERS
	const currentHeader = rows[0] ?? [];
	const headerMatches =
		currentHeader.length === APP_HEADERS.length &&
		APP_HEADERS.every((h, i) => currentHeader[i] === h);

	if (!headerMatches) {
		await sheets.spreadsheets.values.update({
			spreadsheetId: sheetId,
			range: 'apps!A1',
			valueInputOption: 'RAW',
			requestBody: { values: [[...APP_HEADERS]] }
		});
	}

	if (rows.length === 0) return [];

	return rows
		.slice(1)
		.filter((r) => r[0])
		.map((r) => ({
			id: r[0] ?? '',
			name: r[1] ?? '',
			folder_id: r[2] ?? '',
			requirements_doc_id: r[3] ?? '',
			database_sheet_id: r[4] ?? '',
			generated_code_doc_id: r[5] ?? '',
			created_at: r[6] ?? '',
			updated_at: r[7] ?? '',
			last_built_at: r[8] ?? '',
			app_owners: (r[9] ?? '').split(',').map((e: string) => e.trim()).filter(Boolean),
			app_password: r[10] ?? '',
			allowed_domains: (r[11] ?? '').split(',').map((e: string) => e.trim()).filter(Boolean),
			spend_usd: parseFloat(r[12] ?? '0') || 0,
			spend_limit_usd: parseFloat(r[13] ?? '0') || 0,
			is_cutoff: (r[14] ?? '') === 'true',
			client_slug: r[15] ?? '',
			app_slug: r[16] ?? '',
			is_home: (r[17] ?? '') === 'true'
		}));
}

export async function getAppById(auth: OAuth2Client, rootFolderId: string, appId: string): Promise<AppConfig | null> {
	const apps = await getConfigSheet(auth, rootFolderId);
	return apps.find((a) => a.id === appId) ?? null;
}

export async function addAppToConfig(auth: OAuth2Client, rootFolderId: string, app: AppConfig): Promise<void> {
	const sheetId = await getConfigSheetId(auth, rootFolderId);
	const sheets = getSheets(auth);
	const row = APP_HEADERS.map((h) => serializeConfigValue(h, app[h as keyof AppConfig]));

	await sheets.spreadsheets.values.append({
		spreadsheetId: sheetId,
		range: 'apps!A:A',
		valueInputOption: 'RAW',
		requestBody: { values: [row] }
	});
}

export async function updateAppInConfig(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string,
	updates: Partial<AppConfig>
): Promise<void> {
	const sheetId = await getConfigSheetId(auth, rootFolderId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: 'apps!A:A'
	});

	const rows = res.data.values ?? [];
	const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === appId);
	if (rowIndex === -1) return;

	const sheetRow = rowIndex + 1; // 1-indexed

	// Get the current full row
	const fullRes = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: `apps!A${sheetRow}:R${sheetRow}`
	});
	const current = fullRes.data.values?.[0] ?? [];
	const updated = APP_HEADERS.map((h, i) => {
		const key = h as keyof AppConfig;
		return key in updates
			? serializeConfigValue(key, updates[key])
			: (current[i] ?? '');
	});

	await sheets.spreadsheets.values.update({
		spreadsheetId: sheetId,
		range: `apps!A${sheetRow}:R${sheetRow}`,
		valueInputOption: 'RAW',
		requestBody: { values: [updated] }
	});
}

export async function addAppSpend(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string,
	amountUsd: number
): Promise<void> {
	if (amountUsd <= 0) return;
	const app = await getAppById(auth, rootFolderId, appId);
	if (!app) return;
	await updateAppInConfig(auth, rootFolderId, appId, { spend_usd: (app.spend_usd || 0) + amountUsd });
}

export async function getAppBySlug(
	auth: OAuth2Client,
	rootFolderId: string,
	clientSlug: string,
	appSlug: string
): Promise<AppConfig | null> {
	const apps = await getConfigSheet(auth, rootFolderId);
	return apps.find((a) => a.client_slug === clientSlug && a.app_slug === appSlug) ?? null;
}

export async function getHomeApp(auth: OAuth2Client, rootFolderId: string): Promise<AppConfig | null> {
	const apps = await getConfigSheet(auth, rootFolderId);
	return apps.find((a) => a.is_home) ?? null;
}

export async function setHomeApp(auth: OAuth2Client, rootFolderId: string, appId: string): Promise<void> {
	const sheetId = await getConfigSheetId(auth, rootFolderId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: 'apps!A:R'
	});

	const rows = res.data.values ?? [];
	// Clear is_home on all rows and set it on the target
	for (let i = 1; i < rows.length; i++) {
		const row = rows[i];
		if (!row[0]) continue;
		const currentIsHome = (row[17] ?? '') === 'true';
		const isTarget = row[0] === appId;
		if (currentIsHome || isTarget) {
			const sheetRow = i + 1;
			// Column R = index 18 (1-based) = column R
			await sheets.spreadsheets.values.update({
				spreadsheetId: sheetId,
				range: `apps!R${sheetRow}`,
				valueInputOption: 'RAW',
				requestBody: { values: [[isTarget ? 'true' : '']] }
			});
		}
	}
}

// ─── App database schema ──────────────────────────────────────────────────────

export async function getAppSchema(auth: OAuth2Client, sheetId: string): Promise<TableSchema[]> {
	const sheets = getSheets(auth);

	const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
	const sheetList = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? '');

	const tables: TableSchema[] = [];

	for (const tableName of sheetList) {
		if (tableName.startsWith('_')) continue; // internal sheets

		const res = await sheets.spreadsheets.values.get({
			spreadsheetId: sheetId,
			range: `${tableName}!1:2` // header + first data row for type inference
		});

		const rows = res.data.values ?? [];
		const headers = rows[0] ?? [];
		const sampleRow = rows[1] ?? [];

		const columns: ColumnDef[] = headers.map((h, i) => ({
			name: String(h),
			type: inferType(sampleRow[i])
		}));

		tables.push({ name: tableName, columns });
	}

	return tables;
}

function inferType(value: unknown): ColumnDef['type'] {
	if (value === undefined || value === null || value === '') return 'string';
	const v = String(value);
	if (/^\d{4}-\d{2}-\d{2}/.test(v)) return 'date';
	if (!isNaN(Number(v))) return 'number';
	if (v.toLowerCase() === 'true' || v.toLowerCase() === 'false') return 'boolean';
	return 'string';
}

// ─── Conversations ────────────────────────────────────────────────────────────

const CONV_HEADERS = ['id', 'app_id', 'role', 'message', 'summary', 'created_at'] as const;

export async function appendConversation(
	auth: OAuth2Client,
	rootFolderId: string,
	entry: Omit<Conversation, 'id'>
): Promise<void> {
	const sheetId = await getConversationsSheetId(auth, rootFolderId);
	await ensureSheetTab(auth, sheetId, 'conversations');
	const sheets = getSheets(auth);

	// Ensure header row exists
	const res = await sheets.spreadsheets.values.get({
		spreadsheetId: sheetId,
		range: 'conversations!A1:F1'
	});

	if (!res.data.values?.length) {
		await sheets.spreadsheets.values.update({
			spreadsheetId: sheetId,
			range: 'conversations!A1',
			valueInputOption: 'RAW',
			requestBody: { values: [[...CONV_HEADERS]] }
		});
	}

	const row = [uuidv4(), entry.app_id, entry.role, entry.message, entry.summary, entry.created_at];

	await sheets.spreadsheets.values.append({
		spreadsheetId: sheetId,
		range: 'conversations!A:A',
		valueInputOption: 'RAW',
		requestBody: { values: [row] }
	});
}

export async function getConversationSummaries(
	auth: OAuth2Client,
	rootFolderId: string,
	appId?: string
): Promise<string[]> {
	try {
		const sheetId = await getConversationsSheetId(auth, rootFolderId);
		await ensureSheetTab(auth, sheetId, 'conversations');
		const sheets = getSheets(auth);

		const res = await sheets.spreadsheets.values.get({
			spreadsheetId: sheetId,
			range: 'conversations!A:F'
		});

		const rows = res.data.values ?? [];
		return rows
			.slice(1)
			.filter((r) => r[4] && (!appId || r[1] === appId)) // summary + optional app filter
			.map((r) => r[4] as string);
	} catch {
		return [];
	}
}

export interface ConversationFeedback {
	id: string;
	summary: string;
	created_at: string;
}

export async function getAppFeedbacks(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string
): Promise<ConversationFeedback[]> {
	try {
		const sheetId = await getConversationsSheetId(auth, rootFolderId);
		await ensureSheetTab(auth, sheetId, 'conversations');
		const sheets = getSheets(auth);

		const res = await sheets.spreadsheets.values.get({
			spreadsheetId: sheetId,
			range: 'conversations!A:F'
		});

		const rows = res.data.values ?? [];
		return rows
			.slice(1)
			.filter((r) => r[0] && r[1] === appId && r[4]) // id + app match + has summary
			.map((r) => ({
				id: r[0] as string,
				summary: r[4] as string,
				created_at: r[5] as string
			}));
	} catch {
		return [];
	}
}

export async function deleteConversationEntry(
	auth: OAuth2Client,
	rootFolderId: string,
	entryId: string
): Promise<boolean> {
	try {
		const sheetId = await getConversationsSheetId(auth, rootFolderId);
		const sheets = getSheets(auth);

		// Find the sheet tab's numeric ID
		const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
		const convSheet = meta.data.sheets?.find((s) => s.properties?.title === 'conversations');
		if (!convSheet?.properties) return false;
		const gid = convSheet.properties.sheetId!;

		// Find which row has this entry ID
		const res = await sheets.spreadsheets.values.get({
			spreadsheetId: sheetId,
			range: 'conversations!A:A'
		});
		const rows = res.data.values ?? [];
		const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === entryId);
		if (rowIndex === -1) return false;

		await sheets.spreadsheets.batchUpdate({
			spreadsheetId: sheetId,
			requestBody: {
				requests: [
					{
						deleteDimension: {
							range: {
								sheetId: gid,
								dimension: 'ROWS',
								startIndex: rowIndex,
								endIndex: rowIndex + 1
							}
						}
					}
				]
			}
		});
		return true;
	} catch {
		return false;
	}
}

// ─── App user management (_users tab) ─────────────────────────────────────────

const USERS_TAB = '_users';
const USER_HEADERS = ['id', 'email', 'password_hash', 'role', 'can_chat', 'created_at'] as const;

export interface AppUser {
	id: string;
	email: string;
	password_hash: string;
	role: 'owner' | 'member';
	can_chat: boolean;
	created_at: string;
}

async function ensureUsersTab(auth: OAuth2Client, spreadsheetId: string): Promise<void> {
	await ensureSheetTab(auth, spreadsheetId, USERS_TAB);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${USERS_TAB}!A1:F1`
	});

	const header = res.data.values?.[0] ?? [];

	if (!header.length) {
		// No header at all — write fresh
		await sheets.spreadsheets.values.update({
			spreadsheetId,
			range: `${USERS_TAB}!A1`,
			valueInputOption: 'RAW',
			requestBody: { values: [[...USER_HEADERS]] }
		});
	} else if (header.length === 4 && header[3] === 'created_at') {
		// Old 4-column schema — migrate: update header and backfill existing rows
		await sheets.spreadsheets.values.update({
			spreadsheetId,
			range: `${USERS_TAB}!A1`,
			valueInputOption: 'RAW',
			requestBody: { values: [[...USER_HEADERS]] }
		});

		// Backfill role='member', can_chat='false' on existing data rows
		const dataRes = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: `${USERS_TAB}!A2:D`
		});
		const dataRows = dataRes.data.values ?? [];
		if (dataRows.length > 0) {
			const backfill = dataRows.map(() => ['member', 'false']);
			await sheets.spreadsheets.values.update({
				spreadsheetId,
				range: `${USERS_TAB}!D2:E${dataRows.length + 1}`,
				valueInputOption: 'RAW',
				requestBody: { values: backfill }
			});
			// Move created_at from column D to column F
			const createdAts = dataRows.map((r) => [r[3] ?? '']);
			await sheets.spreadsheets.values.update({
				spreadsheetId,
				range: `${USERS_TAB}!F2:F${dataRows.length + 1}`,
				valueInputOption: 'RAW',
				requestBody: { values: createdAts }
			});
		}
	}
}

export async function findAppUser(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string,
	email: string
): Promise<AppUser | null> {
	const app = await getAppById(auth, rootFolderId, appId);
	if (!app?.database_sheet_id) return null;

	const spreadsheetId = app.database_sheet_id;
	await ensureUsersTab(auth, spreadsheetId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${USERS_TAB}!A:F`
	});

	const rows = res.data.values ?? [];
	const dataRows = rows.slice(1);
	const row = dataRows.find((r) => (r[1] ?? '').toLowerCase() === email.toLowerCase());
	if (!row) return null;

	return {
		id: row[0] ?? '',
		email: row[1] ?? '',
		password_hash: row[2] ?? '',
		role: row[3] === 'owner' ? 'owner' : 'member',
		can_chat: (row[4] ?? '').toLowerCase() === 'true',
		created_at: row[5] ?? ''
	};
}

export async function createAppUser(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string,
	email: string,
	passwordHash: string,
	role: 'owner' | 'member' = 'member',
	canChat: boolean = false
): Promise<string> {
	const app = await getAppById(auth, rootFolderId, appId);
	if (!app?.database_sheet_id) throw new Error('App has no database sheet');

	const spreadsheetId = app.database_sheet_id;
	await ensureUsersTab(auth, spreadsheetId);
	const sheets = getSheets(auth);

	const userId = uuidv4();
	const now = new Date().toISOString();

	await sheets.spreadsheets.values.append({
		spreadsheetId,
		range: `${USERS_TAB}!A:A`,
		valueInputOption: 'RAW',
		requestBody: { values: [[userId, email, passwordHash, role, String(canChat), now]] }
	});

	return userId;
}

export async function listAppUsers(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string
): Promise<AppUser[]> {
	const app = await getAppById(auth, rootFolderId, appId);
	if (!app?.database_sheet_id) return [];

	const spreadsheetId = app.database_sheet_id;
	await ensureUsersTab(auth, spreadsheetId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${USERS_TAB}!A:F`
	});

	const rows = res.data.values ?? [];
	return rows
		.slice(1)
		.filter((r) => r[0])
		.map((r) => ({
			id: r[0] ?? '',
			email: r[1] ?? '',
			password_hash: r[2] ?? '',
			role: (r[3] === 'owner' ? 'owner' : 'member') as 'owner' | 'member',
			can_chat: (r[4] ?? '').toLowerCase() === 'true',
			created_at: r[5] ?? ''
		}));
}

export async function updateAppUser(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string,
	userId: string,
	updates: Partial<Pick<AppUser, 'role' | 'can_chat' | 'password_hash'>>
): Promise<boolean> {
	const app = await getAppById(auth, rootFolderId, appId);
	if (!app?.database_sheet_id) return false;

	const spreadsheetId = app.database_sheet_id;
	await ensureUsersTab(auth, spreadsheetId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${USERS_TAB}!A:F`
	});

	const rows = res.data.values ?? [];
	const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === userId);
	if (rowIndex === -1) return false;

	const row = rows[rowIndex];
	const updated = [
		row[0] ?? '',
		row[1] ?? '',
		updates.password_hash !== undefined ? updates.password_hash : (row[2] ?? ''),
		updates.role !== undefined ? updates.role : (row[3] ?? 'member'),
		updates.can_chat !== undefined ? String(updates.can_chat) : (row[4] ?? 'false'),
		row[5] ?? ''
	];

	const sheetRow = rowIndex + 1;
	await sheets.spreadsheets.values.update({
		spreadsheetId,
		range: `${USERS_TAB}!A${sheetRow}:F${sheetRow}`,
		valueInputOption: 'RAW',
		requestBody: { values: [updated] }
	});

	return true;
}

export async function deleteAppUser(
	auth: OAuth2Client,
	rootFolderId: string,
	appId: string,
	userId: string
): Promise<boolean> {
	const app = await getAppById(auth, rootFolderId, appId);
	if (!app?.database_sheet_id) return false;

	const spreadsheetId = app.database_sheet_id;
	const sheets = getSheets(auth);

	// Find the _users tab's numeric ID
	const meta = await sheets.spreadsheets.get({ spreadsheetId });
	const usersSheet = meta.data.sheets?.find((s) => s.properties?.title === USERS_TAB);
	if (!usersSheet?.properties) return false;
	const gid = usersSheet.properties.sheetId!;

	// Find which row has this user ID
	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${USERS_TAB}!A:A`
	});
	const rows = res.data.values ?? [];
	const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === userId);
	if (rowIndex === -1) return false;

	await sheets.spreadsheets.batchUpdate({
		spreadsheetId,
		requestBody: {
			requests: [
				{
					deleteDimension: {
						range: {
							sheetId: gid,
							dimension: 'ROWS',
							startIndex: rowIndex,
							endIndex: rowIndex + 1
						}
					}
				}
			]
		}
	});
	return true;
}
