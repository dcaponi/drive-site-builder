import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, getAppSchema, getConversationSummaries, addAppSpend } from '$lib/server/sheets.js';
import { readRequirementsDoc, readGeneratedCode, writeGeneratedCode } from '$lib/server/drive.js';
import { generateApp, continueApp, isTruncated, stripTruncationMarker } from '$lib/server/anthropic.js';
import { error, json } from '@sveltejs/kit';
import { createJob, updateJob } from '$lib/server/jobQueue.js';

export const POST: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser;
	const appId = params.appId!;
	const auth = getAuthedClient(user, url.origin);
	const rootFolderId = user.root_folder_id!;

	const app = await getAppById(auth, rootFolderId, appId);
	if (!app) throw error(404, 'App not found');

	const [requirements, schema, uxSummaries, existingCode] = await Promise.all([
		readRequirementsDoc(auth, app.requirements_doc_id),
		getAppSchema(auth, app.database_sheet_id),
		getConversationSummaries(auth, rootFolderId, appId),
		app.generated_code_doc_id ? readGeneratedCode(auth, app.generated_code_doc_id) : Promise.resolve('')
	]);

	const shouldContinue = isTruncated(existingCode);

	const jobId = createJob();

	(async () => {
		let totalCost = 0;
		const trackCost = (c: number) => { totalCost += c; };

		try {
			if (shouldContinue) {
				const partialCode = stripTruncationMarker(existingCode);
				let continuation = '';

				updateJob(jobId, { status: 'running', progress: 'Continuing previous build…' });

				for await (const chunk of continueApp(partialCode, requirements, schema, url.origin, appId, uxSummaries, trackCost)) {
					continuation += chunk;
				}

				updateJob(jobId, { status: 'running', progress: 'Saving to Drive…' });

				await writeGeneratedCode(
					auth, rootFolderId, appId, app.name,
					partialCode + '\n' + continuation,
					app.folder_id, app.generated_code_doc_id || undefined
				);
			} else {
				let fullCode = '';

				updateJob(jobId, { status: 'running', progress: 'Generating code…' });

				for await (const chunk of generateApp(requirements, schema, url.origin, appId, uxSummaries, trackCost)) {
					fullCode += chunk;
				}

				updateJob(jobId, { status: 'running', progress: 'Saving to Drive…' });

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
