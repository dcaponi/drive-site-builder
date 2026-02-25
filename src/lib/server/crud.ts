import type { OAuth2Client } from 'google-auth-library';
import { getSheets } from './google.js';
import { getAppById } from './sheets.js';
import type { CrudRecord } from '../types.js';
import { v4 as uuidv4 } from 'uuid';

// Resolve the spreadsheet ID for an app
async function getDbSheetId(auth: OAuth2Client, appId: string): Promise<string> {
	const app = await getAppById(auth, appId);
	if (!app) throw new Error(`App ${appId} not found`);
	if (!app.database_sheet_id) throw new Error(`App ${appId} has no database sheet`);
	return app.database_sheet_id;
}

// Get all sheet (table) names for an app
export async function listTables(auth: OAuth2Client, appId: string): Promise<string[]> {
	const spreadsheetId = await getDbSheetId(auth, appId);
	const sheets = getSheets(auth);
	const meta = await sheets.spreadsheets.get({ spreadsheetId });
	return (meta.data.sheets ?? [])
		.map((s) => s.properties?.title ?? '')
		.filter((t) => t && !t.startsWith('_'));
}

// Read all records from a table
export async function listRecords(
	auth: OAuth2Client,
	appId: string,
	table: string,
	userId?: string
): Promise<CrudRecord[]> {
	const spreadsheetId = await getDbSheetId(auth, appId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${table}!A:ZZ`
	});

	const rows = res.data.values ?? [];
	if (rows.length < 1) return [];

	const headers = rows[0].map(String);
	const userIdIdx = headers.indexOf('user_id');

	let dataRows = rows.slice(1);

	// Filter by userId if the table has a user_id column and caller provides one
	if (userId && userIdIdx !== -1) {
		dataRows = dataRows.filter((row) => row[userIdIdx] === userId);
	}

	return dataRows.map((row) => {
		const record: CrudRecord = { id: '' };
		headers.forEach((h, i) => {
			record[h] = row[i] ?? '';
		});
		// ensure id is a string
		if (!record.id) record.id = String(rows.indexOf(row) + 1);
		return record;
	});
}

// Read a single record by id
export async function getRecord(
	auth: OAuth2Client,
	appId: string,
	table: string,
	id: string
): Promise<CrudRecord | null> {
	const records = await listRecords(auth, appId, table);
	return records.find((r) => r.id === id) ?? null;
}

// Create a new record
export async function createRecord(
	auth: OAuth2Client,
	appId: string,
	table: string,
	data: Record<string, unknown>,
	userId?: string
): Promise<CrudRecord> {
	const spreadsheetId = await getDbSheetId(auth, appId);
	const sheets = getSheets(auth);

	// Get headers from row 1
	const headerRes = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${table}!1:1`
	});

	let headers = (headerRes.data.values?.[0] ?? []).map(String);

	// Inject user_id if userId is provided and table has or will have user_id column
	if (userId) {
		if (!headers.includes('user_id') && headers.length === 0) {
			// Will bootstrap — include user_id
			data = { ...data, user_id: userId };
		} else if (headers.includes('user_id') && !('user_id' in data)) {
			data = { ...data, user_id: userId };
		} else if (!headers.includes('user_id') && headers.length > 0) {
			// Table exists without user_id — inject into data so it's written even if header not present
			data = { ...data, user_id: userId };
		}
	}

	if (headers.length === 0) {
		// Bootstrap headers from data keys, ensure id is first
		headers = ['id', ...Object.keys(data).filter((k) => k !== 'id')];
		await sheets.spreadsheets.values.update({
			spreadsheetId,
			range: `${table}!A1`,
			valueInputOption: 'RAW',
			requestBody: { values: [headers] }
		});
	} else if (userId && !headers.includes('user_id')) {
		// Add user_id column to existing table
		headers = [...headers, 'user_id'];
		await sheets.spreadsheets.values.update({
			spreadsheetId,
			range: `${table}!A1`,
			valueInputOption: 'RAW',
			requestBody: { values: [headers] }
		});
	}

	const id = uuidv4();
	const record: CrudRecord = { id, ...data };
	const row = headers.map((h) => (h === 'id' ? id : (record[h] ?? '')));

	await sheets.spreadsheets.values.append({
		spreadsheetId,
		range: `${table}!A:A`,
		valueInputOption: 'RAW',
		requestBody: { values: [row] }
	});

	return record;
}

// Update a record by id (partial update)
export async function updateRecord(
	auth: OAuth2Client,
	appId: string,
	table: string,
	id: string,
	data: Record<string, unknown>,
	userId?: string
): Promise<CrudRecord | null> {
	const spreadsheetId = await getDbSheetId(auth, appId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${table}!A:ZZ`
	});

	const rows = res.data.values ?? [];
	if (rows.length < 1) return null;

	const headers = rows[0].map(String);
	const idColIndex = headers.indexOf('id');
	if (idColIndex === -1) return null;

	const rowIndex = rows.findIndex((r, i) => i > 0 && r[idColIndex] === id);
	if (rowIndex === -1) return null;

	// Verify ownership if userId provided
	if (userId) {
		const userIdIdx = headers.indexOf('user_id');
		if (userIdIdx !== -1 && rows[rowIndex][userIdIdx] !== userId) return null;
	}

	const sheetRowNum = rowIndex + 1; // 1-indexed
	const current: CrudRecord = { id: '' };
	headers.forEach((h, i) => {
		current[h] = rows[rowIndex][i] ?? '';
	});

	const updated: CrudRecord = { ...current, ...data, id }; // id is immutable
	const updatedRow = headers.map((h) => updated[h] ?? '');

	const colLetter = columnLetter(headers.length);
	await sheets.spreadsheets.values.update({
		spreadsheetId,
		range: `${table}!A${sheetRowNum}:${colLetter}${sheetRowNum}`,
		valueInputOption: 'RAW',
		requestBody: { values: [updatedRow] }
	});

	return updated;
}

// Delete a record by id (clears the row)
export async function deleteRecord(
	auth: OAuth2Client,
	appId: string,
	table: string,
	id: string,
	userId?: string
): Promise<boolean> {
	const spreadsheetId = await getDbSheetId(auth, appId);
	const sheets = getSheets(auth);

	const res = await sheets.spreadsheets.values.get({
		spreadsheetId,
		range: `${table}!A:A`
	});

	const idCol = res.data.values ?? [];
	const rowIndex = idCol.findIndex((r, i) => i > 0 && r[0] === id);
	if (rowIndex === -1) return false;

	// Verify ownership if userId provided
	if (userId) {
		const fullRes = await sheets.spreadsheets.values.get({
			spreadsheetId,
			range: `${table}!A:ZZ`
		});
		const allRows = fullRes.data.values ?? [];
		const headers = (allRows[0] ?? []).map(String);
		const userIdIdx = headers.indexOf('user_id');
		if (userIdIdx !== -1 && allRows[rowIndex]?.[userIdIdx] !== userId) return false;
	}

	// Get spreadsheet sheet id for batchUpdate
	const meta = await sheets.spreadsheets.get({ spreadsheetId });
	const sheetMeta = meta.data.sheets?.find(
		(s) => s.properties?.title === table
	);
	if (!sheetMeta) return false;

	const sheetId = sheetMeta.properties?.sheetId!;
	const sheetRowNum = rowIndex; // 0-indexed for batchUpdate

	await sheets.spreadsheets.batchUpdate({
		spreadsheetId,
		requestBody: {
			requests: [
				{
					deleteDimension: {
						range: {
							sheetId,
							dimension: 'ROWS',
							startIndex: sheetRowNum,
							endIndex: sheetRowNum + 1
						}
					}
				}
			]
		}
	});

	return true;
}

function columnLetter(n: number): string {
	let result = '';
	while (n > 0) {
		const rem = (n - 1) % 26;
		result = String.fromCharCode(65 + rem) + result;
		n = Math.floor((n - 1) / 26);
	}
	return result || 'A';
}
