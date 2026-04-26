import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { getAuthedClient } from '$lib/server/auth.js';
import { unregisterApp, unregisterSlug } from '$lib/server/rootAuth.js';
import { getAppById, getAppSchema, getAppFeedbacks, setHomeApp, listAppUsers, deleteAppFromConfig } from '$lib/server/sheets.js';
import { readRequirementsDoc, readGeneratedCode, listFolderAssets, listFolderScripts, getDocIdForPath } from '$lib/server/drive.js';
import { scanSiteTree, resolveTree, type ResolvedNode } from '$lib/server/siteTree.js';

interface TreeDto {
	path: string;
	folderId: string;
	folderName: string;
	nameValid: boolean;
	nameError: string | null;
	hasOwnRequirements: boolean;
	hasContent: boolean;
	hasBuild: boolean;
	children: TreeDto[];
}

function toTreeDto(n: ResolvedNode, docIdMapRaw: string): TreeDto {
	return {
		path: n.path,
		folderId: n.folderId,
		folderName: n.folderName,
		nameValid: n.nameValid,
		nameError: n.nameError,
		hasOwnRequirements: n.hasOwnRequirements,
		hasContent: n.hasContent,
		hasBuild: !!getDocIdForPath(docIdMapRaw, n.path),
		children: n.children.map((c) => toTreeDto(c, docIdMapRaw))
	};
}

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const app = await getAppById(auth, rootFolderId, params.appId!);
	if (!app) throw error(404, 'App not found');

	const treePromise = (async () => {
		try {
			const raw = await scanSiteTree(auth, app.folder_id);
			const resolved = await resolveTree(auth, raw);
			return toTreeDto(resolved, app.generated_code_doc_id);
		} catch {
			return null;
		}
	})();

	const [requirements, schema, feedbacks, members, assets, scripts, hasCode, tree] = await Promise.all([
		readRequirementsDoc(auth, app.requirements_doc_id).catch(() => ''),
		getAppSchema(auth, app.database_sheet_id).catch(() => []),
		getAppFeedbacks(auth, rootFolderId, params.appId!).catch(() => []),
		listAppUsers(auth, rootFolderId, params.appId!).catch(() => []),
		listFolderAssets(auth, app.folder_id).catch(() => []),
		listFolderScripts(auth, app.folder_id).catch(() => []),
		(() => {
			const rootDocId = getDocIdForPath(app.generated_code_doc_id, '/');
			return rootDocId
				? readGeneratedCode(auth, rootDocId).then((c) => c.trim().length > 0).catch(() => false)
				: Promise.resolve(false);
		})(),
		treePromise
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
		hasCode,
		tree
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
