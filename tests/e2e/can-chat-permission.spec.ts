import { test, expect } from '@playwright/test';
import { resetMocks, seedApp } from '../helpers/seed';
import { setAppToken } from '../helpers/auth';

const ROOT_FOLDER = 'root-folder-3';
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

test.describe.serial('can_chat permission toggle', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'chat-perm-app',
			appName: 'Chat Perm App',
			folderId: 'cp-folder',
			requirementsDocId: 'cp-req',
			databaseSheetId: 'cp-db',
			generatedCodeDocId: 'cp-gen',
			generatedCode: '<html><body><h1>Chat Perm</h1></body></html>',
			appPassword: 'hashed-pass',
			appOwners: ['owner@test.com'],
			ownerEmail: OWNER_EMAIL
		});
	});

	test('app-owner token with can_chat=true shows chat bubble', async ({ page, context }) => {
		await setAppToken(context, 'chat-perm-app', 'app-owner', true);
		await page.goto('/serve/chat-perm-app');
		await expect(page.getByLabel('Open edit chat')).toBeVisible();
	});

	test('app-owner token with can_chat=false hides chat bubble', async ({ page, context }) => {
		await setAppToken(context, 'chat-perm-app', 'app-owner', false);
		await page.goto('/serve/chat-perm-app');
		await expect(page.getByLabel('Open edit chat')).not.toBeVisible();
	});

	test('public token never shows chat bubble', async ({ page, context }) => {
		await setAppToken(context, 'chat-perm-app', 'public', false);
		await page.goto('/serve/chat-perm-app');
		await expect(page.getByLabel('Open edit chat')).not.toBeVisible();
	});
});
