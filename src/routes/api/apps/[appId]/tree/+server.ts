import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById } from '$lib/server/sheets.js';
import { scanSiteTree, resolveTree, type ResolvedNode } from '$lib/server/siteTree.js';
import { getDocIdForPath } from '$lib/server/drive.js';
import { error, json } from '@sveltejs/kit';

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

function toDto(n: ResolvedNode, docIdMapRaw: string): TreeDto {
	return {
		path: n.path,
		folderId: n.folderId,
		folderName: n.folderName,
		nameValid: n.nameValid,
		nameError: n.nameError,
		hasOwnRequirements: n.hasOwnRequirements,
		hasContent: n.hasContent,
		hasBuild: !!getDocIdForPath(docIdMapRaw, n.path),
		children: n.children.map((c) => toDto(c, docIdMapRaw))
	};
}

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser;
	const appId = params.appId!;
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const app = await getAppById(auth, rootFolderId, appId);
	if (!app) throw error(404, 'App not found');

	const raw = await scanSiteTree(auth, app.folder_id);
	const resolved = await resolveTree(auth, raw);

	return json({ tree: toDto(resolved, app.generated_code_doc_id) });
};
