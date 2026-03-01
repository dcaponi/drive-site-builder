import { test, expect } from '@playwright/test';
import { resetMocks, seedApp } from '../helpers/seed';
import { setRootSession } from '../helpers/auth';

const ROOT_FOLDER = 'root-folder-mm';
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

const BASE_URL = 'http://localhost:4173';

test.describe.serial('Member management API', () => {
	test.beforeAll(async () => {
		await resetMocks({ rootFolderId: ROOT_FOLDER, user: DEFAULT_USER });
		await seedApp({
			rootFolderId: ROOT_FOLDER,
			appId: 'mm-app-1',
			appName: 'Member Mgmt App',
			folderId: 'mm-folder-1',
			requirementsDocId: 'mm-req-1',
			databaseSheetId: 'mm-db-1',
			generatedCodeDocId: 'mm-gen-1',
			generatedCode: '<html><body><h1>Members App</h1></body></html>',
			ownerEmail: OWNER_EMAIL
		});
	});

	test('root user can add a member', async ({ context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		const cookies = await context.cookies();
		const sessionCookie = cookies.find(c => c.name === 'session');

		const res = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Cookie: `session=${sessionCookie!.value}`
			},
			body: JSON.stringify({ email: 'alice@example.com', role: 'member', can_chat: true })
		});
		expect(res.status).toBe(201);
		const body = await res.json();
		expect(body.email).toBe('alice@example.com');
		expect(body.role).toBe('member');
		expect(body.can_chat).toBe(true);
	});

	test('root user can list members', async ({ context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		const cookies = await context.cookies();
		const sessionCookie = cookies.find(c => c.name === 'session');

		const res = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`, {
			headers: { Cookie: `session=${sessionCookie!.value}` }
		});
		expect(res.status).toBe(200);
		const members = await res.json();
		expect(Array.isArray(members)).toBe(true);
		expect(members.length).toBeGreaterThanOrEqual(1);
		expect(members[0].email).toBe('alice@example.com');
		expect(members[0].has_password).toBe(false);
		// Ensure password_hash is NOT included
		expect(members[0].password_hash).toBeUndefined();
	});

	test('root user can update a member', async ({ context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		const cookies = await context.cookies();
		const sessionCookie = cookies.find(c => c.name === 'session');

		// Get the member's userId
		const listRes = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`, {
			headers: { Cookie: `session=${sessionCookie!.value}` }
		});
		const members = await listRes.json();
		const userId = members[0].id;

		const res = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				Cookie: `session=${sessionCookie!.value}`
			},
			body: JSON.stringify({ userId, role: 'owner', can_chat: true })
		});
		expect(res.status).toBe(200);
	});

	test('root user can delete a member', async ({ context }) => {
		await setRootSession(context, OWNER_EMAIL, ROOT_FOLDER);
		const cookies = await context.cookies();
		const sessionCookie = cookies.find(c => c.name === 'session');

		// Get the member's userId
		const listRes = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`, {
			headers: { Cookie: `session=${sessionCookie!.value}` }
		});
		const members = await listRes.json();
		const userId = members[0].id;

		const res = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
				Cookie: `session=${sessionCookie!.value}`
			},
			body: JSON.stringify({ userId })
		});
		expect(res.status).toBe(200);

		// Verify deleted
		const listRes2 = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`, {
			headers: { Cookie: `session=${sessionCookie!.value}` }
		});
		const remaining = await listRes2.json();
		expect(remaining.length).toBe(0);
	});

	test('unauthenticated user gets 401', async () => {
		const res = await fetch(`${BASE_URL}/api/apps/mm-app-1/members`);
		expect(res.status).toBe(401);
	});
});
