import { test, expect } from '@playwright/test';
import { resetMocks, seedApp } from '../helpers/seed';

const ROOT_FOLDER = 'root-folder-4';
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

test.describe.serial('Public app access', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'public-app-1',
			appName: 'Public App',
			folderId: 'pub-folder',
			requirementsDocId: 'pub-req',
			databaseSheetId: 'pub-db',
			generatedCodeDocId: 'pub-gen',
			generatedCode: '<html><body><h1>Public</h1></body></html>',
			ownerEmail: OWNER_EMAIL
			// No app_password → public access
		});
	});

	test('public app shows iframe without login', async ({ page }) => {
		await page.goto('/serve/public-app-1');
		const iframe = page.locator('iframe');
		await expect(iframe).toBeVisible();
	});

	test('public app does not show chat bubble', async ({ page }) => {
		await page.goto('/serve/public-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});

	test('public app does not show login form', async ({ page }) => {
		await page.goto('/serve/public-app-1');
		const passwordInput = page.locator('input[type="password"]');
		await expect(passwordInput).not.toBeVisible();
	});
});
