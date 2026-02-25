import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { getRootClient, isRootAvailable } from '$lib/server/rootAuth.js';
import {
	getAppById,
	getAppSchema,
	appendConversation,
	getConversationSummaries
} from '$lib/server/sheets.js';
import {
	readRequirementsDoc,
	readGeneratedCode,
	writeGeneratedCode,
	appendToRequirementsDoc
} from '$lib/server/drive.js';
import {
	generateEditDiff,
	editApp,
	summariseRequest,
	classifyIntent,
	chatConversation
} from '$lib/server/anthropic.js';
import { parseEditBlocks, applyEditBlocks, isFullHtml } from '$lib/server/editDiff.js';
import { verifyAppToken, appCookieName } from '$lib/server/appAuth.js';
import { createJob, updateJob } from '$lib/server/jobQueue.js';
import { error, json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ params, request, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;
	const appId = params.appId!;

	let auth;
	if (user) {
		auth = getAuthedClient(user, url.origin);
	} else {
		// Non-Google user — must have app-owner JWT
		if (!isRootAvailable()) return json({ error: 'Service unavailable' }, { status: 503 });
		auth = getRootClient(url.origin);

		// Verify app-owner role before doing any work
		const app = await getAppById(auth, appId);
		if (!app) return json({ error: 'App not found' }, { status: 404 });

		if (app.app_password) {
			const cookieToken = cookies.get(appCookieName(app.id));
			if (!cookieToken) return json({ error: 'Unauthorized' }, { status: 401 });
			const { valid, role } = await verifyAppToken(cookieToken, app.id, app.app_password);
			if (!valid || role !== 'app-owner') {
				return json({ error: 'Chat requires app-owner access' }, { status: 403 });
			}
		} else {
			// No password set — only root (Google OAuth) can chat on public apps
			return json({ error: 'Chat requires app-owner authentication' }, { status: 403 });
		}
	}

	const body = await request.json().catch(() => ({}));
	const editRequest: string = String(body.message ?? '').trim();
	if (!editRequest) return json({ error: 'Message is required' }, { status: 400 });

	const app = await getAppById(auth, appId);
	if (!app) throw error(404, 'App not found');

	// ── Classify intent first ─────────────────────────────────────────────────
	const intent = await classifyIntent(editRequest);

	// ── Chat response (non-update) ────────────────────────────────────────────
	if (intent === 'chat') {
		const requirements = await readRequirementsDoc(auth, app.requirements_doc_id).catch(
			() => 'No requirements available.'
		);

		// Log user message in background
		const now = new Date().toISOString();
		appendConversation(auth, {
			app_id: appId,
			role: 'user',
			message: editRequest,
			summary: '',
			created_at: now
		}).catch(() => {});

		const stream = new ReadableStream({
			async start(controller) {
				const enc = new TextEncoder();
				let fullReply = '';
				try {
					for await (const chunk of chatConversation(editRequest, app.name, requirements)) {
						fullReply += chunk;
						controller.enqueue(enc.encode(chunk));
					}
					// Log assistant reply in background
					appendConversation(auth, {
						app_id: appId,
						role: 'assistant',
						message: fullReply,
						summary: '',
						created_at: new Date().toISOString()
					}).catch(() => {});
					controller.close();
				} catch (err) {
					controller.error(err instanceof Error ? err.message : 'Chat failed');
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/plain; charset=utf-8',
				'X-Response-Type': 'chat',
				'Cache-Control': 'no-cache'
			}
		});
	}

	// ── Update response (background job) ─────────────────────────────────────
	if (!app.generated_code_doc_id) {
		return json({ error: 'App has not been built yet.' }, { status: 400 });
	}

	const jobId = createJob();

	// Kick off background update — do NOT await
	(async () => {
		try {
			updateJob(jobId, { status: 'running', progress: 'Loading app…' });

			// Fetch everything in parallel
			const [requirements, schema, currentCode, uxSummaries] = await Promise.all([
				readRequirementsDoc(auth, app.requirements_doc_id),
				getAppSchema(auth, app.database_sheet_id),
				readGeneratedCode(auth, app.generated_code_doc_id),
				getConversationSummaries(auth, appId).catch(() => [] as string[])
			]);

			// Log user message
			const now = new Date().toISOString();
			appendConversation(auth, {
				app_id: appId,
				role: 'user',
				message: editRequest,
				summary: '',
				created_at: now
			}).catch(() => {});

			const summaryPromise = summariseRequest(editRequest);

			// ── Phase 1: Try diff-based editing ──────────────────────────────
			updateJob(jobId, { progress: 'Generating diff…' });
			let diffOutput = '';
			const diffGenerator = generateEditDiff(
				currentCode,
				editRequest,
				requirements,
				schema,
				url.origin,
				appId,
				uxSummaries
			);

			for await (const chunk of diffGenerator) {
				diffOutput += chunk;
			}

			let finalCode: string;

			if (!isFullHtml(diffOutput)) {
				const blocks = parseEditBlocks(diffOutput);
				if (blocks.length > 0) {
					const { code: patched, success } = applyEditBlocks(currentCode, blocks);
					if (success) {
						finalCode = patched;
						updateJob(jobId, { progress: 'Saving changes…' });

						const [summary] = await Promise.all([
							summaryPromise,
							writeGeneratedCode(
								auth,
								appId,
								app.name,
								patched,
								app.folder_id,
								app.generated_code_doc_id || undefined
							)
						]);

						if (app.requirements_doc_id) {
							appendToRequirementsDoc(
								auth,
								app.requirements_doc_id,
								summary,
								new Date().toISOString()
							).catch(() => {});
						}

						await appendConversation(auth, {
							app_id: appId,
							role: 'assistant',
							message: `Edit applied: ${editRequest}`,
							summary,
							created_at: new Date().toISOString()
						});

						updateJob(jobId, { status: 'done', progress: 'Done' });
						return;
					}
					// Diff apply failed — fall through to full regen
				}
			}

			// ── Phase 2: Full regeneration ────────────────────────────────────
			updateJob(jobId, { progress: 'Regenerating app…' });
			let fullCode = '';

			if (isFullHtml(diffOutput)) {
				fullCode = diffOutput;
			} else {
				const fullGenerator = editApp(
					currentCode,
					editRequest,
					requirements,
					schema,
					url.origin,
					appId,
					uxSummaries
				);

				for await (const chunk of fullGenerator) {
					fullCode += chunk;
				}
			}

			updateJob(jobId, { progress: 'Saving changes…' });

			const [summary] = await Promise.all([
				summaryPromise,
				writeGeneratedCode(
					auth,
					appId,
					app.name,
					fullCode,
					app.folder_id,
					app.generated_code_doc_id || undefined
				)
			]);

			if (app.requirements_doc_id) {
				appendToRequirementsDoc(
					auth,
					app.requirements_doc_id,
					summary,
					new Date().toISOString()
				).catch(() => {});
			}

			await appendConversation(auth, {
				app_id: appId,
				role: 'assistant',
				message: `Edit applied: ${editRequest}`,
				summary,
				created_at: new Date().toISOString()
			});

			updateJob(jobId, { status: 'done', progress: 'Done' });
		} catch (err) {
			updateJob(jobId, {
				status: 'error',
				progress: 'Failed',
				error: err instanceof Error ? err.message : 'Unknown error'
			});
		}
	})();

	return json({ type: 'job', jobId }, { status: 202 });
};
