import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import {
	getAppById,
	getAppSchema,
	getConversationSummaries,
	addAppSpend
} from '$lib/server/sheets.js';
import {
	readGeneratedCode,
	writeGeneratedCode,
	listFolderAssets,
	listFolderScripts,
	getDocIdForPath,
	parseDocIdMap,
	serializeDocIdMap
} from '$lib/server/drive.js';
import {
	scanSiteTree,
	resolveTree,
	findNodeByPath,
	descendants,
	buildRouteManifest,
	normalizePath,
	type ResolvedNode
} from '$lib/server/siteTree.js';
import {
	generateApp,
	continueApp,
	isTruncated,
	stripTruncationMarker,
	injectScripts
} from '$lib/server/anthropic.js';
import { error, json } from '@sveltejs/kit';
import { createJob, updateJob } from '$lib/server/jobQueue.js';
import { stripCodeFences } from '$lib/server/editDiff.js';

function countLines(s: string): number {
	return s.split('\n').length;
}

export const POST: RequestHandler = async ({ params, url, locals }) => {
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
	if (!target) return json({ error: `No folder maps to ${targetPath}` }, { status: 404 });
	if (!target.nameValid) {
		return json(
			{ error: `Cannot build "${target.folderName}": ${target.nameError}` },
			{ status: 400 }
		);
	}

	const candidates: ResolvedNode[] = (recursive ? descendants(target) : [target])
		.filter((n) => n.nameValid);

	if (candidates.length === 0) {
		return json({ error: 'No valid pages to build (all candidate folders have invalid names).' }, { status: 400 });
	}

	const jobId = createJob();

	(async () => {
		let totalCost = 0;
		const trackCost = (c: number) => { totalCost += c; };
		const onProgress = (msg: string) => updateJob(jobId, { progress: msg });

		try {
			updateJob(jobId, { status: 'running', progress: 'Loading app context…' });

			const [schema, uxSummaries, assets, scripts] = await Promise.all([
				getAppSchema(auth, app.database_sheet_id),
				getConversationSummaries(auth, rootFolderId, appId).catch(() => [] as string[]),
				listFolderAssets(auth, app.folder_id),
				listFolderScripts(auth, app.folder_id)
			]);
			const routes = buildRouteManifest(resolved);

			let docIdMapRaw = app.generated_code_doc_id;

			for (let i = 0; i < candidates.length; i++) {
				const node = candidates[i];
				const pageLabel = `${i + 1}/${candidates.length} ${node.path}`;

				const pageCtx = {
					rootStyleGuide: node.rootStyleGuide,
					pageContent: node.content,
					routes,
					currentPath: node.path
				};

				const existingDocId = getDocIdForPath(docIdMapRaw, node.path);
				const existingCode = existingDocId
					? await readGeneratedCode(auth, existingDocId).catch(() => '')
					: '';
				const shouldContinue = !!existingCode && isTruncated(existingCode);

				let writtenDocId: string;
				if (shouldContinue) {
					const partialCode = stripTruncationMarker(existingCode);
					updateJob(jobId, {
						progress: `[${pageLabel}] Continuing previous build (${countLines(partialCode)} lines so far)…`
					});

					let continuation = '';
					let lines = countLines(partialCode);
					for await (const chunk of continueApp(
						partialCode,
						node.requirements,
						schema,
						url.origin,
						appId,
						uxSummaries,
						trackCost,
						assets,
						scripts,
						onProgress,
						pageCtx
					)) {
						continuation += chunk;
						const newLines = countLines(partialCode + continuation);
						if (newLines > lines) {
							lines = newLines;
							updateJob(jobId, { progress: `[${pageLabel}] Generating — ${lines} lines…` });
						}
					}
					continuation = stripCodeFences(continuation);
					const fullCode = injectScripts(partialCode + '\n' + continuation, scripts);

					updateJob(jobId, { progress: `[${pageLabel}] Saving (${countLines(fullCode)} lines)…` });
					writtenDocId = await writeGeneratedCode(
						auth, rootFolderId, appId, app.name, fullCode,
						app.folder_id, docIdMapRaw, node.path
					);
				} else {
					updateJob(jobId, { progress: `[${pageLabel}] Generating code…` });

					let fullCode = '';
					let lines = 0;
					for await (const chunk of generateApp(
						node.requirements,
						schema,
						url.origin,
						appId,
						uxSummaries,
						trackCost,
						assets,
						scripts,
						onProgress,
						pageCtx
					)) {
						fullCode += chunk;
						const newLines = countLines(fullCode);
						if (newLines > lines) {
							lines = newLines;
							updateJob(jobId, { progress: `[${pageLabel}] Generating — ${lines} lines…` });
						}
					}
					fullCode = stripCodeFences(fullCode);
					fullCode = injectScripts(fullCode, scripts);

					updateJob(jobId, { progress: `[${pageLabel}] Saving (${countLines(fullCode)} lines)…` });
					writtenDocId = await writeGeneratedCode(
						auth, rootFolderId, appId, app.name, fullCode,
						app.folder_id, docIdMapRaw, node.path
					);
				}

				const map = parseDocIdMap(docIdMapRaw);
				map[node.path] = writtenDocId;
				docIdMapRaw = serializeDocIdMap(map);
			}

			if (totalCost > 0) addAppSpend(auth, rootFolderId, appId, totalCost).catch(() => {});

			updateJob(jobId, { status: 'done', progress: `Done — built ${candidates.length} page(s).` });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Build failed';
			updateJob(jobId, { status: 'error', progress: 'Build failed', error: message });
		}
	})();

	return json({ jobId, pageCount: candidates.length }, { status: 202 });
};
