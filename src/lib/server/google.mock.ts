/**
 * In-memory mock implementations of Google Sheets, Drive, and Docs APIs.
 * Active only when TEST_MODE=1.
 */

import { v4 as uuidv4 } from 'uuid';

// ─── In-memory stores ─────────────────────────────────────────────────────────

/** spreadsheetId → tabName → rows (each row is string[]) */
const _sheets = new Map<string, Map<string, string[][]>>();

/** fileId → file metadata + content */
interface MockFile {
	id: string;
	name: string;
	mimeType: string;
	content: string;
	parents: string[];
}
const _files = new Map<string, MockFile>();

// ─── Public helpers for seeding / resetting ───────────────────────────────────

export function resetMockData(): void {
	_sheets.clear();
	_files.clear();
}

export function seedDriveFile(
	id: string,
	name: string,
	mimeType: string,
	content: string,
	parents: string[] = []
): void {
	_files.set(id, { id, name, mimeType, content, parents });
}

export function seedSheetData(
	spreadsheetId: string,
	tabName: string,
	rows: string[][]
): void {
	if (!_sheets.has(spreadsheetId)) _sheets.set(spreadsheetId, new Map());
	_sheets.get(spreadsheetId)!.set(tabName, rows);
}

export function getMockState() {
	return { sheets: _sheets, files: _files };
}

// ─── Sheet helpers ────────────────────────────────────────────────────────────

function getTab(spreadsheetId: string, tabName: string): string[][] {
	const tabs = _sheets.get(spreadsheetId);
	if (!tabs) return [];
	return tabs.get(tabName) ?? [];
}

function setTab(spreadsheetId: string, tabName: string, rows: string[][]): void {
	if (!_sheets.has(spreadsheetId)) _sheets.set(spreadsheetId, new Map());
	_sheets.get(spreadsheetId)!.set(tabName, rows);
}

function parseRange(range: string): { tab: string; startCol: number; startRow: number; endCol: number; endRow: number } {
	// e.g. "apps!A1:R1", "apps!A:R", "conversations!A1:F1", "apps!A:A", "apps!R5"
	const match = range.match(/^([^!]+)!([A-Z]+)(\d+)?(?::([A-Z]+)(\d+)?)?$/);
	if (!match) {
		// Simple tab name
		return { tab: range, startCol: 0, startRow: 0, endCol: 25, endRow: 999999 };
	}
	const tab = match[1];
	const startCol = colToIndex(match[2]);
	const startRow = match[3] ? parseInt(match[3]) - 1 : 0;
	const endCol = match[4] ? colToIndex(match[4]) : startCol;
	const endRow = match[5] ? parseInt(match[5]) - 1 : 999999;
	return { tab, startCol, startRow, endCol, endRow };
}

function colToIndex(col: string): number {
	let idx = 0;
	for (let i = 0; i < col.length; i++) {
		idx = idx * 26 + (col.charCodeAt(i) - 64);
	}
	return idx - 1; // 0-based
}

// ─── Mock Sheets client ──────────────────────────────────────────────────────

export function getMockSheets(_auth?: unknown) {
	return {
		spreadsheets: {
			get: async ({ spreadsheetId }: { spreadsheetId: string }) => {
				const tabs = _sheets.get(spreadsheetId);
				const sheets = tabs
					? Array.from(tabs.keys()).map((title, i) => ({
							properties: { title, sheetId: i }
						}))
					: [{ properties: { title: 'Sheet1', sheetId: 0 } }];
				return { data: { sheets } };
			},

			values: {
				get: async ({ spreadsheetId, range }: { spreadsheetId: string; range: string }) => {
					const parsed = parseRange(range);
					const rows = getTab(spreadsheetId, parsed.tab);
					const sliced = rows
						.slice(parsed.startRow, parsed.endRow + 1)
						.map((row) => row.slice(parsed.startCol, parsed.endCol + 1));
					return { data: { values: sliced } };
				},

				update: async ({
					spreadsheetId,
					range,
					requestBody
				}: {
					spreadsheetId: string;
					range: string;
					valueInputOption?: string;
					requestBody: { values: string[][] };
				}) => {
					const parsed = parseRange(range);
					const rows = getTab(spreadsheetId, parsed.tab);
					// Expand rows if needed
					while (rows.length <= parsed.startRow) rows.push([]);
					for (let i = 0; i < requestBody.values.length; i++) {
						const rowIdx = parsed.startRow + i;
						while (rows.length <= rowIdx) rows.push([]);
						const row = rows[rowIdx];
						for (let j = 0; j < requestBody.values[i].length; j++) {
							const colIdx = parsed.startCol + j;
							while (row.length <= colIdx) row.push('');
							row[colIdx] = requestBody.values[i][j];
						}
					}
					setTab(spreadsheetId, parsed.tab, rows);
					return { data: {} };
				},

				append: async ({
					spreadsheetId,
					range,
					requestBody
				}: {
					spreadsheetId: string;
					range: string;
					valueInputOption?: string;
					requestBody: { values: string[][] };
				}) => {
					const parsed = parseRange(range);
					const rows = getTab(spreadsheetId, parsed.tab);
					for (const newRow of requestBody.values) {
						rows.push(newRow);
					}
					setTab(spreadsheetId, parsed.tab, rows);
					return { data: {} };
				}
			},

			batchUpdate: async ({
				spreadsheetId,
				requestBody
			}: {
				spreadsheetId: string;
				requestBody: { requests: Array<Record<string, unknown>> };
			}) => {
				for (const req of requestBody.requests) {
					if (req.updateSheetProperties) {
						const props = (req.updateSheetProperties as { properties: { title: string; sheetId: number } }).properties;
						const tabs = _sheets.get(spreadsheetId);
						if (tabs) {
							// Find old tab name by sheetId and rename
							const allTabs = Array.from(tabs.entries());
							const idx = props.sheetId;
							if (idx < allTabs.length) {
								const [oldName, data] = allTabs[idx];
								tabs.delete(oldName);
								tabs.set(props.title, data);
							}
						}
					} else if (req.addSheet) {
						const title = ((req.addSheet as { properties: { title: string } }).properties).title;
						if (!_sheets.has(spreadsheetId)) _sheets.set(spreadsheetId, new Map());
						_sheets.get(spreadsheetId)!.set(title, []);
					} else if (req.deleteDimension) {
						const dim = req.deleteDimension as { range: { sheetId: number; dimension: string; startIndex: number; endIndex: number } };
						const tabs = _sheets.get(spreadsheetId);
						if (tabs && dim.range.dimension === 'ROWS') {
							const allTabs = Array.from(tabs.entries());
							if (dim.range.sheetId < allTabs.length) {
								const [tabName, rows] = allTabs[dim.range.sheetId];
								rows.splice(dim.range.startIndex, dim.range.endIndex - dim.range.startIndex);
								tabs.set(tabName, rows);
							}
						}
					}
				}
				return { data: {} };
			}
		}
	};
}

// ─── Mock Drive client ───────────────────────────────────────────────────────

export function getMockDrive(_auth?: unknown) {
	return {
		files: {
			list: async ({
				q,
				fields,
				pageSize,
				...rest
			}: {
				q?: string;
				fields?: string;
				pageSize?: number;
				orderBy?: string;
				supportsAllDrives?: boolean;
				includeItemsFromAllDrives?: boolean;
			}) => {
				const files: MockFile[] = [];
				for (const f of _files.values()) {
					if (q && !matchQuery(q, f)) continue;
					files.push(f);
				}
				return { data: { files: files.slice(0, pageSize ?? 100) } };
			},

			create: async ({
				requestBody,
				media,
				fields,
				...rest
			}: {
				requestBody: { name: string; mimeType: string; parents?: string[] };
				media?: { mimeType: string; body: string };
				fields?: string;
				supportsAllDrives?: boolean;
				includeItemsFromAllDrives?: boolean;
			}) => {
				const id = uuidv4();
				const file: MockFile = {
					id,
					name: requestBody.name,
					mimeType: requestBody.mimeType,
					content: media?.body ?? '',
					parents: requestBody.parents ?? []
				};
				_files.set(id, file);
				// If it's a spreadsheet, init the sheets map
				if (requestBody.mimeType === 'application/vnd.google-apps.spreadsheet') {
					_sheets.set(id, new Map([['Sheet1', []]]));
				}
				return { data: { id } };
			},

			get: async ({
				fileId,
				fields,
				alt,
				...rest
			}: {
				fileId: string;
				fields?: string;
				alt?: string;
				supportsAllDrives?: boolean;
				includeItemsFromAllDrives?: boolean;
			}) => {
				const file = _files.get(fileId);
				if (!file) throw new Error(`File not found: ${fileId}`);
				if (alt === 'media') {
					return { data: file.content };
				}
				return { data: { id: file.id, name: file.name, mimeType: file.mimeType } };
			},

			update: async ({
				fileId,
				media,
				...rest
			}: {
				fileId: string;
				media?: { mimeType: string; body: string };
				requestBody?: Record<string, unknown>;
				supportsAllDrives?: boolean;
				includeItemsFromAllDrives?: boolean;
			}) => {
				const file = _files.get(fileId);
				if (!file) throw new Error(`File not found: ${fileId}`);
				if (media) file.content = media.body;
				return { data: { id: file.id } };
			},

			delete: async ({
				fileId,
				...rest
			}: {
				fileId: string;
				supportsAllDrives?: boolean;
				includeItemsFromAllDrives?: boolean;
			}) => {
				_files.delete(fileId);
				return { data: {} };
			},

			export: async (
				params: { fileId: string; mimeType: string },
				opts?: { responseType: string }
			) => {
				const file = _files.get(params.fileId);
				if (!file) throw new Error(`File not found: ${params.fileId}`);
				return { data: file.content };
			}
		}
	};
}

function matchQuery(q: string, file: MockFile): boolean {
	// Simple query matcher for common Drive query patterns
	// "name = 'X' and 'Y' in parents and mimeType = 'Z' and trashed = false"
	const nameMatch = q.match(/name\s*=\s*'([^']+)'/);
	if (nameMatch && file.name !== nameMatch[1]) return false;

	const parentMatch = q.match(/'([^']+)'\s+in\s+parents/);
	if (parentMatch && !file.parents.includes(parentMatch[1])) return false;

	const mimeMatch = q.match(/mimeType\s*=\s*'([^']+)'/);
	if (mimeMatch && file.mimeType !== mimeMatch[1]) return false;

	return true;
}

// ─── Mock Docs client ────────────────────────────────────────────────────────

export function getMockDocs(_auth?: unknown) {
	return {
		documents: {
			get: async ({ documentId }: { documentId: string }) => {
				const file = _files.get(documentId);
				const length = file ? file.content.length + 1 : 1;
				return {
					data: {
						body: {
							content: [{ endIndex: length }]
						}
					}
				};
			},
			batchUpdate: async ({
				documentId,
				requestBody
			}: {
				documentId: string;
				requestBody: { requests: Array<{ insertText?: { location: { index: number }; text: string } }> };
			}) => {
				const file = _files.get(documentId);
				if (file) {
					for (const req of requestBody.requests) {
						if (req.insertText) {
							const idx = req.insertText.location.index - 1;
							file.content =
								file.content.slice(0, idx) +
								req.insertText.text +
								file.content.slice(idx);
						}
					}
				}
				return { data: {} };
			}
		}
	};
}
