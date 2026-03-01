import { test, expect } from '@playwright/test';
import { resetMocks, seedApp } from '../helpers/seed';
import { setRootSession } from '../helpers/auth';

const ROOT_FOLDER = 'root-folder-1';
const OWNER_EMAIL = 'owner@test.com';

const DEFAULT_USER = {
	email: OWNER_EMAIL,
	name: 'Owner',
	picture: '',
	access_token: 'mock-access',
	refresh_token: 'mock-refresh',
	expiry_date: Date.now() + 3600_000,
	root_folder_id: ROOT_FOLDER
};

test.describe.serial('App content serving', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'test-app-1',
			appName: 'Content Test App',
			folderId: 'folder-1',
			requirementsDocId: 'req-doc-1',
			databaseSheetId: 'db-sheet-1',
			generatedCodeDocId: 'gen-code-1',
			generatedCode: '<html><body><h1>Hello World</h1></body></html>',
			ownerEmail: OWNER_EMAIL
		});
	});

	test('owner can see the app iframe', async ({ page, context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		await page.goto('/serve/test-app-1');
		const iframe = page.locator('iframe');
		await expect(iframe).toBeVisible();
	});

	test('owner sees the chat bubble', async ({ page, context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		await page.goto('/serve/test-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).toBeVisible();
	});

	test('unauthenticated user on public app sees iframe without chat', async ({ page }) => {
		// No password set, so app is public
		await page.goto('/serve/test-app-1');
		const iframe = page.locator('iframe');
		await expect(iframe).toBeVisible();
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});
});
