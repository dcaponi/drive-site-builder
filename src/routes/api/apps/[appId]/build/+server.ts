import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, getAppSchema, getConversationSummaries, addAppSpend } from '$lib/server/sheets.js';
import { readRequirementsDoc, readGeneratedCode, writeGeneratedCode } from '$lib/server/drive.js';
import { generateApp, continueApp, isTruncated, stripTruncationMarker } from '$lib/server/anthropic.js';
import { error } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, locals, url }) => {
	const user = locals.user as SessionUser;
	const appId = params.appId!;
	const auth = getAuthedClient(user, url.origin);

	const app = await getAppById(auth, appId);
	if (!app) throw error(404, 'App not found');

	const [requirements, schema, uxSummaries, existingCode] = await Promise.all([
		readRequirementsDoc(auth, app.requirements_doc_id),
		getAppSchema(auth, app.database_sheet_id),
		getConversationSummaries(auth, appId),
		app.generated_code_doc_id ? readGeneratedCode(auth, app.generated_code_doc_id) : Promise.resolve('')
	]);

	const shouldContinue = isTruncated(existingCode);

	const stream = new ReadableStream({
		async start(controller) {
			const enc = new TextEncoder();
			let totalCost = 0;
			const trackCost = (c: number) => { totalCost += c; };

			try {
				if (shouldContinue) {
					const partialCode = stripTruncationMarker(existingCode);
					let continuation = '';

					controller.enqueue(enc.encode('<!-- Continuing from previous output… -->\n'));

					for await (const chunk of continueApp(partialCode, requirements, schema, url.origin, appId, uxSummaries, trackCost)) {
						continuation += chunk;
						controller.enqueue(enc.encode(chunk));
					}

					await writeGeneratedCode(
						auth, appId, app.name,
						partialCode + '\n' + continuation,
						app.folder_id, app.generated_code_doc_id || undefined
					);
				} else {
					let fullCode = '';

					for await (const chunk of generateApp(requirements, schema, url.origin, appId, uxSummaries, trackCost)) {
						fullCode += chunk;
						controller.enqueue(enc.encode(chunk));
					}

					await writeGeneratedCode(
						auth, appId, app.name, fullCode,
						app.folder_id, app.generated_code_doc_id || undefined
					);
				}

				if (totalCost > 0) addAppSpend(auth, appId, totalCost).catch(() => {});

				controller.close();
			} catch (err) {
				controller.error(err instanceof Error ? err.message : 'Build failed');
			}
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/plain; charset=utf-8',
			'Cache-Control': 'no-cache'
		}
	});
};
