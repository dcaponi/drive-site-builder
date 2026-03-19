import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, getAppSchema, getConversationSummaries, addAppSpend } from '$lib/server/sheets.js';
import { readRequirementsDoc, readGeneratedCode, writeGeneratedCode, listFolderAssets, listFolderScripts } from '$lib/server/drive.js';
import { generateApp, continueApp, isTruncated, stripTruncationMarker, injectScripts } from '$lib/server/anthropic.js';
import { error, json } from '@sveltejs/kit';
import { createJob, updateJob } from '$lib/server/jobQueue.js';
import { stripCodeFences } from '$lib/server/editDiff.js';

function countLines(code: string): number {
	return code.split('\n').length;
}

export const POST: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser;
	const appId = params.appId!;
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const app = await getAppById(auth, rootFolderId, appId);
	if (!app) throw error(404, 'App not found');

	const [requirements, schema, uxSummaries, existingCode, assets, scripts] = await Promise.all([
		readRequirementsDoc(auth, app.requirements_doc_id),
		getAppSchema(auth, app.database_sheet_id),
		getConversationSummaries(auth, rootFolderId, appId),
		app.generated_code_doc_id ? readGeneratedCode(auth, app.generated_code_doc_id) : Promise.resolve(''),
		listFolderAssets(auth, app.folder_id),
		listFolderScripts(auth, app.folder_id)
	]);

	const shouldContinue = isTruncated(existingCode);

	const jobId = createJob();

	(async () => {
		let totalCost = 0;
		const trackCost = (c: number) => { totalCost += c; };
		const onProgress = (msg: string) => updateJob(jobId, { progress: msg });

		try {
			if (shouldContinue) {
				const partialCode = stripTruncationMarker(existingCode);
				let continuation = '';
				let lines = countLines(partialCode);

				updateJob(jobId, { status: 'running', progress: `Continuing previous build (${lines} lines so far)…` });

				for await (const chunk of continueApp(partialCode, requirements, schema, url.origin, appId, uxSummaries, trackCost, assets, scripts, onProgress)) {
					continuation += chunk;
					const newLines = countLines(partialCode + continuation);
					if (newLines > lines) {
						lines = newLines;
						updateJob(jobId, { progress: `Generating code — ${lines} lines written…` });
					}
				}
				continuation = stripCodeFences(continuation);

				updateJob(jobId, { progress: `Saving to Drive (${countLines(partialCode + continuation)} lines)…` });

				const continuedCode = injectScripts(partialCode + '\n' + continuation, scripts);
				await writeGeneratedCode(
					auth, rootFolderId, appId, app.name,
					continuedCode,
					app.folder_id, app.generated_code_doc_id || undefined
				);
			} else {
				let fullCode = '';
				let lines = 0;

				updateJob(jobId, { status: 'running', progress: 'Generating code…' });

				for await (const chunk of generateApp(requirements, schema, url.origin, appId, uxSummaries, trackCost, assets, scripts, onProgress)) {
					fullCode += chunk;
					const newLines = countLines(fullCode);
					if (newLines > lines) {
						lines = newLines;
						updateJob(jobId, { progress: `Generating code — ${lines} lines written…` });
					}
				}
				fullCode = stripCodeFences(fullCode);

				updateJob(jobId, { progress: `Saving to Drive (${countLines(fullCode)} lines)…` });

				fullCode = injectScripts(fullCode, scripts);
				await writeGeneratedCode(
					auth, rootFolderId, appId, app.name, fullCode,
					app.folder_id, app.generated_code_doc_id || undefined
				);
			}

			if (totalCost > 0) addAppSpend(auth, rootFolderId, appId, totalCost).catch(() => {});

			updateJob(jobId, { status: 'done', progress: 'Done' });
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Build failed';
			updateJob(jobId, { status: 'error', progress: 'Build failed', error: message });
		}
	})();

	return json({ jobId }, { status: 202 });
};
