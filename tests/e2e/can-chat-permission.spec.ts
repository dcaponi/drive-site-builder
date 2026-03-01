import { test, expect } from '@playwright/test';
import { resetMocks, seedApp, seedMember } from '../helpers/seed';
import { setUserToken } from '../helpers/auth';

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
			ownerEmail: OWNER_EMAIL
		});
		// Seed members for testing
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'chat-perm-app',
			databaseSheetId: 'cp-db',
			email: 'chatter@example.com',
			role: 'owner',
			canChat: true
		});
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'chat-perm-app',
			databaseSheetId: 'cp-db',
			email: 'nochat@example.com',
			role: 'owner',
			canChat: false
		});
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'chat-perm-app',
			databaseSheetId: 'cp-db',
			email: 'viewer@example.com',
			role: 'member',
			canChat: false
		});
	});

	test('member with can_chat=true shows chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'chat-perm-app', 'user-1', 'chatter@example.com', 'owner', true);
		await page.goto('/serve/chat-perm-app');
		await expect(page.getByLabel('Open edit chat')).toBeVisible();
	});

	test('member with can_chat=false hides chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'chat-perm-app', 'user-2', 'nochat@example.com', 'owner', false);
		await page.goto('/serve/chat-perm-app');
		await expect(page.getByLabel('Open edit chat')).not.toBeVisible();
	});

	test('public member never shows chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'chat-perm-app', 'user-3', 'viewer@example.com', 'member', false);
		await page.goto('/serve/chat-perm-app');
		await expect(page.getByLabel('Open edit chat')).not.toBeVisible();
	});
});
