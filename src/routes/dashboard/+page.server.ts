import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getConfigSheet, setHomeApp, updateAppInConfig } from '$lib/server/sheets.js';
import { listAppFolders, registerApp, verifyRootFolder, createAppScaffold, toSlug } from '$lib/server/drive.js';
import { hashPassword } from '$lib/server/userAuth.js';
import { fail } from '@sveltejs/kit';

// Scrypt output: 32-hex-char salt + ":" + 128-hex-char hash
function isHashedPassword(s: string): boolean {
	return /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(s);
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);

	let apps: Awaited<ReturnType<typeof getConfigSheet>> = [];
	let folders: Array<{ id: string; name: string }> = [];
	let driveError: string | null = null;
	let rootFolderName: string | null = null;

	try {
		// Verify the root folder first — gives a clear error if the ID or token is wrong
		const root = await verifyRootFolder(auth);
		rootFolderName = root.name;

		[apps, folders] = await Promise.all([
			getConfigSheet(auth),
			listAppFolders(auth)
		]);

		// Auto-migrate any plain-text app_passwords to hashed form
		const needsHash = apps.filter((a) => a.app_password && !isHashedPassword(a.app_password));
		if (needsHash.length > 0) {
			await Promise.all(
				needsHash.map((a) =>
					updateAppInConfig(auth, a.id, { app_password: hashPassword(a.app_password) })
				)
			);
			// Re-read so the returned apps have hashed passwords
			apps = await getConfigSheet(auth);
		}
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		driveError = msg.includes('insufficientPermissions') || msg.includes('Request had insufficient')
			? 'Missing Drive permissions — sign out and sign back in to re-authorize with Drive access.'
			: msg.includes('invalid_grant') || msg.includes('Token has been expired')
			? 'Session expired — sign out and sign back in.'
			: msg;
	}

	return { apps, folders, driveError, rootFolderName };
};

export const actions: Actions = {
	register: async ({ request, locals, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);

		const data = await request.formData();
		const folderId = String(data.get('folder_id') ?? '').trim();
		const folderName = String(data.get('folder_name') ?? '').trim();
		const clientName = String(data.get('client_name') ?? '').trim();
		const clientSlug = clientName ? toSlug(clientName) : '';

		if (!folderId) return fail(400, { error: 'Folder ID is required' });

		try {
			const app = await registerApp(auth, folderId, folderName || folderId, clientSlug);
			return { success: true, appId: app.id };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Registration failed' });
		}
	},

	create: async ({ request, locals, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const clientName = String(data.get('client_name') ?? '').trim();
		const clientSlug = clientName ? toSlug(clientName) : undefined;

		if (!name) return fail(400, { error: 'App name is required' });

		try {
			const app = await createAppScaffold(auth, name, clientSlug);
			return { success: true, appId: app.id, created: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Creation failed' });
		}
	},

	migrateApps: async ({ locals, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);

		try {
			const apps = await getConfigSheet(auth);
			const toBackfill = apps.filter((a) => !a.app_slug);
			await Promise.all(
				toBackfill.map((a) =>
					updateAppInConfig(auth, a.id, {
						app_slug: toSlug(a.name),
						client_slug: a.client_slug ?? ''
					})
				)
			);
			return { migrated: toBackfill.length };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Migration failed' });
		}
	},

	setHome: async ({ request, locals, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);

		const data = await request.formData();
		const appId = String(data.get('app_id') ?? '').trim();

		if (!appId) return fail(400, { error: 'App ID is required' });

		try {
			await setHomeApp(auth, appId);
			return { success: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to set home app' });
		}
	}
};
