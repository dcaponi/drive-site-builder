import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient, createSessionToken, makeSessionCookie } from '$lib/server/auth.js';
import { getConfigSheet, setHomeApp, updateAppInConfig } from '$lib/server/sheets.js';
import { listAppFolders, registerApp, verifyRootFolder, createAppScaffold, toSlug, ensureUserRootFolder } from '$lib/server/drive.js';
import { hashPassword } from '$lib/server/userAuth.js';
import { registerAppOwner, registerSlug } from '$lib/server/rootAuth.js';
import { fail } from '@sveltejs/kit';

// Scrypt output: 32-hex-char salt + ":" + 128-hex-char hash
function isHashedPassword(s: string): boolean {
	return /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(s);
}

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);

	// ── Lazy root folder provisioning ─────────────────────────────────────
	let rootFolderId = user.root_folder_id;
	if (!rootFolderId) {
		rootFolderId = await ensureUserRootFolder(auth, user.email);
		// Update session cookie with root_folder_id so subsequent requests have it
		const updatedUser: SessionUser = { ...user, root_folder_id: rootFolderId };
		const token = await createSessionToken(updatedUser);
		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 30 * 24 * 3600
		});
		// Also update locals so the rest of this request uses it
		locals.user = updatedUser;
	}

	let apps: Awaited<ReturnType<typeof getConfigSheet>> = [];
	let folders: Array<{ id: string; name: string }> = [];
	let driveError: string | null = null;
	let rootFolderName: string | null = null;

	try {
		// Verify the root folder first — gives a clear error if the ID or token is wrong
		const root = await verifyRootFolder(auth, rootFolderId);
		rootFolderName = root.name;

		[apps, folders] = await Promise.all([
			getConfigSheet(auth, rootFolderId),
			listAppFolders(auth, rootFolderId)
		]);

		// Auto-migrate any plain-text app_passwords to hashed form
		const needsHash = apps.filter((a) => a.app_password && !isHashedPassword(a.app_password));
		if (needsHash.length > 0) {
			await Promise.all(
				needsHash.map((a) =>
					updateAppInConfig(auth, rootFolderId!, a.id, { app_password: hashPassword(a.app_password) })
				)
			);
			// Re-read so the returned apps have hashed passwords
			apps = await getConfigSheet(auth, rootFolderId);
		}

		// Populate app + slug registries for public-serving routes
		for (const app of apps) {
			registerAppOwner(app.id, user.email, rootFolderId);
			if (app.client_slug && app.app_slug) {
				registerSlug(app.client_slug, app.app_slug, app.id);
			}
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
		const rootFolderId = user.root_folder_id!;

		const data = await request.formData();
		const folderId = String(data.get('folder_id') ?? '').trim();
		const folderName = String(data.get('folder_name') ?? '').trim();
		const clientName = String(data.get('client_name') ?? '').trim();
		const clientSlug = clientName ? toSlug(clientName) : '';

		if (!folderId) return fail(400, { error: 'Folder ID is required' });

		try {
			const app = await registerApp(auth, rootFolderId, folderId, folderName || folderId, clientSlug);
			registerAppOwner(app.id, user.email, rootFolderId);
			if (app.client_slug && app.app_slug) {
				registerSlug(app.client_slug, app.app_slug, app.id);
			}
			return { success: true, appId: app.id };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Registration failed' });
		}
	},

	create: async ({ request, locals, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);
		const rootFolderId = user.root_folder_id!;

		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const clientName = String(data.get('client_name') ?? '').trim();
		const clientSlug = clientName ? toSlug(clientName) : undefined;

		if (!name) return fail(400, { error: 'App name is required' });

		try {
			const app = await createAppScaffold(auth, rootFolderId, name, clientSlug);
			registerAppOwner(app.id, user.email, rootFolderId);
			if (app.client_slug && app.app_slug) {
				registerSlug(app.client_slug, app.app_slug, app.id);
			}
			return { success: true, appId: app.id, created: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Creation failed' });
		}
	},

	migrateApps: async ({ locals, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);
		const rootFolderId = user.root_folder_id!;

		try {
			const apps = await getConfigSheet(auth, rootFolderId);
			const toBackfill = apps.filter((a) => !a.app_slug);
			await Promise.all(
				toBackfill.map((a) =>
					updateAppInConfig(auth, rootFolderId, a.id, {
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
		const rootFolderId = user.root_folder_id!;

		const data = await request.formData();
		const appId = String(data.get('app_id') ?? '').trim();

		if (!appId) return fail(400, { error: 'App ID is required' });

		try {
			await setHomeApp(auth, rootFolderId, appId);
			return { success: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to set home app' });
		}
	}
};
