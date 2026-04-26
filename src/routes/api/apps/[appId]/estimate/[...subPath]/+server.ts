import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, getAppSchema, getConversationSummaries } from '$lib/server/sheets.js';
import { listFolderAssets, listFolderScripts } from '$lib/server/drive.js';
import {
	scanSiteTree,
	resolveTree,
	findNodeByPath,
	descendants,
	buildRouteManifest,
	normalizePath,
	type ResolvedNode
} from '$lib/server/siteTree.js';
import { estimateBuildCost } from '$lib/server/anthropic.js';
import { error, json } from '@sveltejs/kit';

interface PerPage {
	path: string;
	folderName: string;
	inputTokens: number;
	outputTokens: number;
	cost: number;
}

interface InvalidEntry {
	path: string;
	folderName: string;
	folderId: string;
	reason: string;
}

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const user = locals.user as SessionUser;
	const appId = params.appId!;
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const recursive = url.searchParams.get('recursive') === '1';
	const targetPath = normalizePath(params.subPath ?? '');

	const app = await getAppById(auth, rootFolderId, appId);
	if (!app) throw error(404, 'App not found');

	const raw = await scanSiteTree(auth, app.folder_id);
	const resolved = await resolveTree(auth, raw);

	const target = findNodeByPath(resolved, targetPath);
	if (!target) {
		return json({ error: `No folder maps to ${targetPath}` }, { status: 404 });
	}

	if (!target.nameValid) {
		return json({
			error: `Cannot build "${target.folderName}": ${target.nameError}`,
			targetInvalid: true,
			invalidPaths: [{
				path: target.path,
				folderName: target.folderName,
				folderId: target.folderId,
				reason: target.nameError
			}]
		}, { status: 400 });
	}

	const candidates: ResolvedNode[] = recursive ? descendants(target) : [target];
	const valid: ResolvedNode[] = [];
	const invalid: InvalidEntry[] = [];
	for (const n of candidates) {
		if (n.nameValid) valid.push(n);
		else invalid.push({
			path: n.path,
			folderName: n.folderName,
			folderId: n.folderId,
			reason: n.nameError ?? 'invalid name'
		});
	}

	const [schema, uxSummaries, assets, scripts] = await Promise.all([
		getAppSchema(auth, app.database_sheet_id).catch(() => []),
		getConversationSummaries(auth, rootFolderId, appId).catch(() => [] as string[]),
		listFolderAssets(auth, app.folder_id).catch(() => []),
		listFolderScripts(auth, app.folder_id).catch(() => [])
	]);
	const routes = buildRouteManifest(resolved);

	const perPage: PerPage[] = await Promise.all(
		valid.map(async (n) => {
			const est = await estimateBuildCost(
				n.requirements,
				schema,
				url.origin,
				appId,
				uxSummaries,
				assets,
				scripts,
				{
					rootStyleGuide: n.rootStyleGuide,
					pageContent: n.content,
					routes,
					currentPath: n.path
				}
			);
			return {
				path: n.path,
				folderName: n.folderName || 'Home',
				inputTokens: est.inputTokens,
				outputTokens: est.outputTokens,
				cost: est.cost
			};
		})
	);

	const totalCost = perPage.reduce((s, p) => s + p.cost, 0);

	return json({
		targetPath,
		recursive,
		pageCount: valid.length,
		totalCost,
		perPage,
		invalidPaths: invalid
	});
};
