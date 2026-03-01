/**
 * Test seed endpoint — only active when TEST_MODE=1.
 * Allows Playwright tests to seed mock data and reset state.
 */
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';

const TEST_MODE = typeof process !== 'undefined' && process.env.TEST_MODE === '1';

export const POST: RequestHandler = async ({ request }) => {
	if (!TEST_MODE) throw error(404, 'Not found');

	const { resetMockData, seedDriveFile, seedSheetData } = await import('$lib/server/google.mock.js');
	const { clearSheetCaches } = await import('$lib/server/sheets.js');

	const body = await request.json();
	const action = body.action as string;

	if (action === 'reset') {
		resetMockData();
		clearSheetCaches();

		// Re-import and clear rootAuth registries
		const rootAuth = await import('$lib/server/rootAuth.js');

		// Seed the root folder as a Drive file
		if (body.rootFolderId) {
			seedDriveFile(body.rootFolderId, 'drive-app-builder', 'application/vnd.google-apps.folder', '', []);
		}

		// Seed user credentials into rootAuth
		if (body.user) {
			rootAuth.setUserCredentials(body.user);
		}

		// Register apps
		if (body.apps) {
			for (const app of body.apps as Array<{ id: string; ownerEmail: string; rootFolderId: string }>) {
				rootAuth.registerAppOwner(app.id, app.ownerEmail, app.rootFolderId);
			}
		}

		// Register slugs
		if (body.slugs) {
			for (const slug of body.slugs as Array<{ clientSlug: string; appSlug: string; appId: string }>) {
				rootAuth.registerSlug(slug.clientSlug, slug.appSlug, slug.appId);
			}
		}

		return json({ ok: true });
	}

	if (action === 'seedDriveFile') {
		seedDriveFile(body.id, body.name, body.mimeType, body.content ?? '', body.parents ?? []);
		return json({ ok: true });
	}

	if (action === 'seedSheetData') {
		seedSheetData(body.spreadsheetId, body.tabName, body.rows);
		return json({ ok: true });
	}

	if (action === 'seedApp') {
		// Convenience: seed a complete app (config sheet row + drive files)
		const {
			rootFolderId,
			appId,
			appName,
			folderId,
			requirementsDocId,
			databaseSheetId,
			generatedCodeDocId,
			generatedCode,
			appPassword,
			appOwners,
			allowedDomains,
			clientSlug,
			appSlug,
			isHome
		} = body;

		// Seed folder
		seedDriveFile(folderId, appName, 'application/vnd.google-apps.folder', '', [rootFolderId]);

		// Seed requirements doc
		if (requirementsDocId) {
			seedDriveFile(requirementsDocId, `${appName} — Requirements`, 'application/vnd.google-apps.document', 'Test requirements', [folderId]);
		}

		// Seed database sheet
		if (databaseSheetId) {
			seedDriveFile(databaseSheetId, `${appName} — Database`, 'application/vnd.google-apps.spreadsheet', '', [folderId]);
			seedSheetData(databaseSheetId, 'Sheet1', []);
		}

		// Seed generated code
		if (generatedCodeDocId && generatedCode) {
			seedDriveFile(generatedCodeDocId, `${appName} — Generated.html`, 'text/plain', generatedCode, [folderId]);
		}

		// Find or create config sheet in root folder
		const configSheetId = `config-${rootFolderId}`;
		seedDriveFile(configSheetId, '_config', 'application/vnd.google-apps.spreadsheet', '', [rootFolderId]);

		// Build the app config row
		const APP_HEADERS = [
			'id', 'name', 'folder_id', 'requirements_doc_id', 'database_sheet_id',
			'generated_code_doc_id', 'created_at', 'updated_at', 'last_built_at',
			'app_owners', 'app_password', 'allowed_domains', 'spend_usd', 'spend_limit_usd',
			'is_cutoff', 'client_slug', 'app_slug', 'is_home'
		];

		const now = new Date().toISOString();
		const row = [
			appId, appName, folderId, requirementsDocId ?? '', databaseSheetId ?? '',
			generatedCodeDocId ?? '', now, now, generatedCodeDocId ? now : '',
			(appOwners ?? []).join(','), appPassword ?? '',
			(allowedDomains ?? []).join(','), '0', '0', 'false',
			clientSlug ?? '', appSlug ?? '', isHome ? 'true' : 'false'
		];

		// Get existing data or init
		const { getMockState } = await import('$lib/server/google.mock.js');
		const state = getMockState();
		let tabs = state.sheets.get(configSheetId);
		if (!tabs) {
			state.sheets.set(configSheetId, new Map());
			tabs = state.sheets.get(configSheetId)!;
		}

		let appRows = tabs.get('apps');
		if (!appRows) {
			appRows = [APP_HEADERS];
			tabs.set('apps', appRows);
		}
		appRows.push(row);

		// Register in rootAuth
		const rootAuth = await import('$lib/server/rootAuth.js');
		rootAuth.registerAppOwner(appId, body.ownerEmail ?? 'owner@test.com', rootFolderId);

		if (clientSlug && appSlug) {
			rootAuth.registerSlug(clientSlug, appSlug, appId);
		}

		return json({ ok: true });
	}

	if (action === 'seedMember') {
		const { databaseSheetId, email, role, canChat, passwordHash } = body;

		const { getMockState } = await import('$lib/server/google.mock.js');
		const { v4: uuidv4 } = await import('uuid');
		const state = getMockState();
		let tabs = state.sheets.get(databaseSheetId);
		if (!tabs) {
			state.sheets.set(databaseSheetId, new Map());
			tabs = state.sheets.get(databaseSheetId)!;
		}

		const USER_HEADERS = ['id', 'email', 'password_hash', 'role', 'can_chat', 'created_at'];
		let userRows = tabs.get('_users');
		if (!userRows) {
			userRows = [USER_HEADERS];
			tabs.set('_users', userRows);
		} else if (userRows.length === 0) {
			userRows.push(USER_HEADERS);
		}

		const userId = uuidv4();
		const now = new Date().toISOString();
		userRows.push([
			userId,
			email ?? '',
			passwordHash ?? '',
			role ?? 'member',
			String(canChat ?? false),
			now
		]);

		return json({ ok: true, userId });
	}

	throw error(400, `Unknown action: ${action}`);
};
