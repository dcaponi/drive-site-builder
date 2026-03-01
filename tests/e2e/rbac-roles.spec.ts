import { test, expect } from '@playwright/test';
import { resetMocks, seedApp, seedMember } from '../helpers/seed';
import { setRootSession, setUserToken } from '../helpers/auth';

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
			membersOnly: true,
			ownerEmail: OWNER_EMAIL
		});
		// Seed members for testing
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'rbac-app-1',
			databaseSheetId: 'rbac-db-1',
			email: 'chatter@example.com',
			role: 'owner',
			canChat: true
		});
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'rbac-app-1',
			databaseSheetId: 'rbac-db-1',
			email: 'nochat@example.com',
			role: 'owner',
			canChat: false
		});
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'rbac-app-1',
			databaseSheetId: 'rbac-db-1',
			email: 'viewer@example.com',
			role: 'member',
			canChat: false
		});
	});

	test('root (Google-authed owner) sees chat bubble', async ({ page, context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).toBeVisible();
	});

	test('member with can_chat=true sees chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'rbac-app-1', 'user-1', 'chatter@example.com', 'owner', true);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).toBeVisible();
	});

	test('member with can_chat=false does NOT see chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'rbac-app-1', 'user-2', 'nochat@example.com', 'owner', false);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});

	test('unauthenticated user sees members-only card, not the app', async ({ page }) => {
		await page.goto('/serve/rbac-app-1');
		// Should show members-only card with sign-in link
		await expect(page.locator('text=This app is for members only')).toBeVisible();
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});

	test('public member does NOT see chat bubble', async ({ page, context }) => {
		await setUserToken(context, 'rbac-app-1', 'user-3', 'viewer@example.com', 'member', false);
		await page.goto('/serve/rbac-app-1');
		const chatBtn = page.getByLabel('Open edit chat');
		await expect(chatBtn).not.toBeVisible();
	});
});
