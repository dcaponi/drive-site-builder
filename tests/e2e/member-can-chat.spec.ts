import { test, expect } from '@playwright/test';
import { resetMocks, seedApp, seedMember } from '../helpers/seed';
import { setUserToken } from '../helpers/auth';

const ROOT_FOLDER = 'root-folder-mc';
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

test.describe.serial('Member can_chat permission', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'mc-app-1',
			appName: 'Member Chat App',
			folderId: 'mc-folder-1',
			requirementsDocId: 'mc-req-1',
			databaseSheetId: 'mc-db-1',
			generatedCodeDocId: 'mc-gen-1',
			generatedCode: '<html><body><h1>Member Chat</h1></body></html>',
			ownerEmail: OWNER_EMAIL
		});
		// Seed members so live lookup works
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'mc-app-1',
			databaseSheetId: 'mc-db-1',
			email: 'chatter@example.com',
			role: 'member',
			canChat: true
		});
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'mc-app-1',
			databaseSheetId: 'mc-db-1',
			email: 'viewer@example.com',
			role: 'member',
			canChat: false
		});
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'mc-app-1',
			databaseSheetId: 'mc-db-1',
			email: 'owner-member@example.com',
			role: 'owner',
			canChat: true
		});
	});

	test('member with can_chat=true sees chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'mc-app-1', 'user-1', 'chatter@example.com', 'member', true);
		await page.goto('/serve/mc-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).toBeVisible();
	});

	test('member with can_chat=false does NOT see chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'mc-app-1', 'user-2', 'viewer@example.com', 'member', false);
		await page.goto('/serve/mc-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});

	test('owner member always sees chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'mc-app-1', 'user-3', 'owner-member@example.com', 'owner', true);
		await page.goto('/serve/mc-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).toBeVisible();
	});
});
