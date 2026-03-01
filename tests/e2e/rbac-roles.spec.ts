import { test, expect } from '@playwright/test';
import { resetMocks, seedApp } from '../helpers/seed';
import { setRootSession, setAppToken } from '../helpers/auth';

const ROOT_FOLDER = 'root-folder-2';
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

test.describe.serial('RBAC role tests', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'rbac-app-1',
			appName: 'RBAC Test App',
			folderId: 'rbac-folder-1',
			requirementsDocId: 'rbac-req-1',
			databaseSheetId: 'rbac-db-1',
			generatedCodeDocId: 'rbac-gen-1',
			generatedCode: '<html><body><h1>RBAC App</h1></body></html>',
			appPassword: 'hashed-pass',
			appOwners: ['owner@test.com'],
			ownerEmail: OWNER_EMAIL
		});
	});

	test('root (Google-authed owner) sees chat bubble', async ({ page, context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).toBeVisible();
	});

	test('app-owner with can_chat=true sees chat bubble', async ({ page, context }) => {
		await setAppToken(context, 'rbac-app-1', 'app-owner', true);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).toBeVisible();
	});

	test('app-owner with can_chat=false does NOT see chat bubble', async ({ page, context }) => {
		await setAppToken(context, 'rbac-app-1', 'app-owner', false);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});

	test('public user sees password form, not the app', async ({ page }) => {
		await page.goto('/serve/rbac-app-1');
		// Should show login form since app has a password
		const passwordInput = page.locator('input[type="password"]');
		await expect(passwordInput).toBeVisible();
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});

	test('public role token does NOT see chat bubble', async ({ page, context }) => {
		await setAppToken(context, 'rbac-app-1', 'public', false);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});
});
