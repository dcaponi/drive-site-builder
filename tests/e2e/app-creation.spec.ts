import { test, expect } from '@playwright/test';
import { resetMocks, seedApp } from '../helpers/seed';
import { setRootSession } from '../helpers/auth';

const ROOT_FOLDER = 'root-folder-5';
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

test.describe.serial('App creation and dashboard', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'dash-app-1',
			appName: 'Dashboard Test App',
			folderId: 'dash-folder',
			requirementsDocId: 'dash-req',
			databaseSheetId: 'dash-db',
			ownerEmail: OWNER_EMAIL
		});
	});

	test('dashboard shows the seeded app', async ({ page, context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		await page.goto('/dashboard');
		await expect(page.getByText('Dashboard Test App')).toBeVisible();
	});

	test('app detail page shows requirements and schema', async ({ page, context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		await page.goto('/app/dash-app-1');
		await expect(page.getByText('Dashboard Test App')).toBeVisible();
		await expect(page.getByRole('heading', { name: /Requirements/ })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Database Schema' })).toBeVisible();
	});

	test('unbuilt app shows "Not built yet" on serve page', async ({ page, context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		await page.goto('/serve/dash-app-1');
		await expect(page.getByText('Not built yet')).toBeVisible();
	});
});
