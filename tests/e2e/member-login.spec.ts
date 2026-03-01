import { test, expect } from '@playwright/test';
import { resetMocks, seedApp, seedMember } from '../helpers/seed';

const ROOT_FOLDER = 'root-folder-ml';
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

test.describe.serial('Member login flow', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'ml-app-1',
			appName: 'Member Login App',
			folderId: 'ml-folder-1',
			requirementsDocId: 'ml-req-1',
			databaseSheetId: 'ml-db-1',
			generatedCodeDocId: 'ml-gen-1',
			generatedCode: '<html><body><h1>Member Login App</h1></body></html>',
			ownerEmail: OWNER_EMAIL
		});

		// Seed a member with no password (first-login scenario)
		await seedMember({
			rootFolderId: ROOT_FOLDER,
			appId: 'ml-app-1',
			databaseSheetId: 'ml-db-1',
			email: 'newuser@example.com',
			role: 'member',
			canChat: true
		});
	});

	test('first login shows confirm field after entering email', async ({ page }) => {
		await page.goto('/serve/ml-app-1/login');

		// Should see the login form
		await expect(page.locator('h1')).toContainText('Member Login App');

		// Fill email and password
		await page.fill('input[name="email"]', 'newuser@example.com');
		await page.fill('input[name="password"]', 'MyPassword123');
		await page.click('button[type="submit"]');

		// Should now show confirm password field (needsConfirm)
		await expect(page.locator('input[name="confirm_password"]')).toBeVisible();
	});

	test('setting password and signing in redirects to app', async ({ page }) => {
		await page.goto('/serve/ml-app-1/login');

		await page.fill('input[name="email"]', 'newuser@example.com');
		await page.fill('input[name="password"]', 'MyPassword123');
		await page.click('button[type="submit"]');

		// Should show confirm field
		await expect(page.locator('input[name="confirm_password"]')).toBeVisible();

		// Fill in confirm password
		await page.fill('input[name="password"]', 'MyPassword123');
		await page.fill('input[name="confirm_password"]', 'MyPassword123');
		await page.click('button[type="submit"]');

		// Should redirect to the app
		await page.waitForURL('**/serve/ml-app-1');
		await expect(page.locator('iframe')).toBeVisible();
	});

	test('subsequent login with correct password works', async ({ page }) => {
		await page.goto('/serve/ml-app-1/login');

		await page.fill('input[name="email"]', 'newuser@example.com');
		await page.fill('input[name="password"]', 'MyPassword123');
		await page.click('button[type="submit"]');

		// Should redirect to the app (password is now set)
		await page.waitForURL('**/serve/ml-app-1');
		await expect(page.locator('iframe')).toBeVisible();
	});

	test('wrong password shows error', async ({ page }) => {
		await page.goto('/serve/ml-app-1/login');

		await page.fill('input[name="email"]', 'newuser@example.com');
		await page.fill('input[name="password"]', 'WrongPassword');
		await page.click('button[type="submit"]');

		// Should show error
		await expect(page.locator('.login-error')).toContainText('Invalid password');
	});

	test('unknown email shows error', async ({ page }) => {
		await page.goto('/serve/ml-app-1/login');

		await page.fill('input[name="email"]', 'unknown@example.com');
		await page.fill('input[name="password"]', 'SomePassword');
		await page.click('button[type="submit"]');

		// Should show error
		await expect(page.locator('.login-error')).toContainText('No account found');
	});
});
