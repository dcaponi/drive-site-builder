import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { getAuthedClient } from '$lib/server/auth.js';
import { unregisterApp, unregisterSlug } from '$lib/server/rootAuth.js';
import { getAppById, getAppSchema, getAppFeedbacks, setHomeApp, listAppUsers, deleteAppFromConfig } from '$lib/server/sheets.js';
import { readRequirementsDoc, readGeneratedCode, listFolderAssets, listFolderScripts } from '$lib/server/drive.js';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const app = await getAppById(auth, rootFolderId, params.appId!);
	if (!app) throw error(404, 'App not found');

	const [requirements, schema, feedbacks, members, assets, scripts, hasCode] = await Promise.all([
		readRequirementsDoc(auth, app.requirements_doc_id).catch(() => ''),
		getAppSchema(auth, app.database_sheet_id).catch(() => []),
		getAppFeedbacks(auth, rootFolderId, params.appId!).catch(() => []),
		listAppUsers(auth, rootFolderId, params.appId!).catch(() => []),
		listFolderAssets(auth, app.folder_id).catch(() => []),
		listFolderScripts(auth, app.folder_id).catch(() => []),
		app.generated_code_doc_id
			? readGeneratedCode(auth, app.generated_code_doc_id).then((c) => c.trim().length > 0).catch(() => false)
			: Promise.resolve(false)
	]);

	// Sanitize members — omit password_hash, add has_password
	const sanitizedMembers = members.map(({ password_hash, ...rest }) => ({
		...rest,
		has_password: !!password_hash
	}));

	return {
		app, requirements, schema, feedbacks, members: sanitizedMembers,
		assets,
		scripts: scripts.map(({ id, name }) => ({ id, name })),
		hasCode
	};
};

export const actions: Actions = {
	setHome: async ({ locals, params, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);
		const rootFolderId = user.root_folder_id!;

		try {
			await setHomeApp(auth, rootFolderId, params.appId!);
			return { success: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to set home app' });
		}
	},

	deleteApp: async ({ locals, params, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);
		const rootFolderId = user.root_folder_id!;
		const appId = params.appId!;

		try {
			const app = await getAppById(auth, rootFolderId, appId);
			await deleteAppFromConfig(auth, rootFolderId, appId);
			unregisterApp(appId);
			if (app?.client_slug && app?.app_slug) {
				unregisterSlug(app.client_slug, app.app_slug);
			}
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to delete app' });
		}

		redirect(303, '/dashboard');
	}
};
