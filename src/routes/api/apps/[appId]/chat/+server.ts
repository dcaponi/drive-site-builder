import type { RequestHandler } from '@sveltejs/kit';
import type { SessionUser } from '$lib/server/auth.js';
import { getAuthedClient } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
import {
	getAppById,
	getAppSchema,
	appendConversation,
	getConversationSummaries,
	addAppSpend
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
	chatWithTools
} from '$lib/server/anthropic.js';
import { parseEditBlocks, applyEditBlocks, isFullHtml, stripDiffMarkers } from '$lib/server/editDiff.js';
import { verifyAppToken, appCookieName } from '$lib/server/appAuth.js';
import { createJob, updateJob } from '$lib/server/jobQueue.js';
import { error, json } from '@sveltejs/kit';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

function isCutoffActive(app: { is_cutoff: boolean; spend_usd: number; spend_limit_usd: number }): boolean {
	if (app.is_cutoff) return true;
	if (app.spend_limit_usd > 0 && app.spend_usd >= app.spend_limit_usd) return true;
	return false;
}

export const POST: RequestHandler = async ({ params, request, locals, url, cookies }) => {
	const user = locals.user as SessionUser | null;
	const appId = params.appId!;

	// Resolve via registry for proper tenant isolation
	const reg = lookupApp(appId);
	if (!reg) return json({ error: 'App owner must log in first' }, { status: 503 });

	const isOwner = user && user.email.toLowerCase() === reg.ownerEmail.toLowerCase();
	const auth = isOwner
		? getAuthedClient(user, url.origin)
		: getUserClient(reg.ownerEmail, url.origin);
	const rootFolderId = reg.rootFolderId;

	// Non-owner, non-Google users need app-owner token
	if (!isOwner) {
		const app = await getAppById(auth, rootFolderId, appId);
		if (!app) return json({ error: 'App not found' }, { status: 404 });

		if (app.app_password) {
			const cookieToken = cookies.get(appCookieName(app.id));
			if (!cookieToken) return json({ error: 'Unauthorized' }, { status: 401 });
			const { valid, role, can_chat } = await verifyAppToken(cookieToken, app.id);
			if (!valid || !can_chat) {
				return json({ error: 'Chat requires app-owner access' }, { status: 403 });
			}
		} else {
			return json({ error: 'Chat requires app-owner authentication' }, { status: 403 });
		}
	}

	const body = await request.json().catch(() => ({}));
	const editRequest: string = String(body.message ?? '').trim();
	if (!editRequest) return json({ error: 'Message is required' }, { status: 400 });

	// User-supplied API key (bypasses spend limit)
	const userApiKey: string | null = (body.userApiKey as string | null) ?? null;

	const app = await getAppById(auth, rootFolderId, appId);
	if (!app) throw error(404, 'App not found');

	// ── Cutoff check ─────────────────────────────────────────────────────────
	if (isCutoffActive(app) && !userApiKey) {
		return json(
			{
				type: 'cutoff',
				spend: app.spend_usd,
				limit: app.spend_limit_usd,
				message: app.is_cutoff
					? 'This app has been manually disabled by the owner.'
					: `Spend limit of $${app.spend_limit_usd.toFixed(2)} reached ($${app.spend_usd.toFixed(2)} used).`
			},
			{ status: 402 }
		);
	}

	// Override Anthropic client if user supplied their own key
	function getAnthropicClient() {
		return new Anthropic({ apiKey: userApiKey ?? env.ANTHROPIC_API_KEY });
	}

	// Cost accumulator — only track when using our key
	let totalCost = 0;
	const trackCost = userApiKey ? undefined : (c: number) => { totalCost += c; };

	// ── Classify intent ───────────────────────────────────────────────────────
	const intent = await classifyIntent(editRequest, trackCost);

	// ── Chat response ─────────────────────────────────────────────────────────
	if (intent === 'chat') {
		const requirements = await readRequirementsDoc(auth, app.requirements_doc_id).catch(
			() => 'No requirements available.'
		);

		const now = new Date().toISOString();
		appendConversation(auth, rootFolderId, {
			app_id: appId,
			role: 'user',
			message: editRequest,
			summary: '',
			created_at: now
		}).catch(() => {});

		const result = await chatWithTools(editRequest, app.name, requirements, trackCost);

		appendConversation(auth, rootFolderId, {
			app_id: appId,
			role: 'assistant',
			message: result.text,
			summary: '',
			created_at: new Date().toISOString()
		}).catch(() => {});

		if (totalCost > 0) addAppSpend(auth, rootFolderId, appId, totalCost).catch(() => {});

		return json({
			type: 'chat',
			text: result.text,
			credentials: result.credentials
		});
	}

	// ── Update (background job) ───────────────────────────────────────────────
	if (!app.generated_code_doc_id) {
		return json({ error: 'App has not been built yet.' }, { status: 400 });
	}

	const jobId = createJob();

	(async () => {
		try {
			updateJob(jobId, { status: 'running', progress: 'Loading app…' });

			const [requirements, schema, currentCode, uxSummaries] = await Promise.all([
				readRequirementsDoc(auth, app.requirements_doc_id),
				getAppSchema(auth, app.database_sheet_id),
				readGeneratedCode(auth, app.generated_code_doc_id).catch(() => ''),
				getConversationSummaries(auth, rootFolderId, appId).catch(() => [] as string[])
			]);

			const now = new Date().toISOString();
			appendConversation(auth, rootFolderId, {
				app_id: appId,
				role: 'user',
				message: editRequest,
				summary: '',
				created_at: now
			}).catch(() => {});

			const summaryPromise = summariseRequest(editRequest, trackCost);

			// ── Phase 1: diff ─────────────────────────────────────────────────
			updateJob(jobId, { progress: 'Generating diff…' });
			let diffOutput = '';
			for await (const chunk of generateEditDiff(
				currentCode, editRequest, requirements, schema, url.origin, appId, uxSummaries, trackCost
			)) {
				diffOutput += chunk;
			}

			let finalCode: string | null = null;

			if (!isFullHtml(diffOutput)) {
				const blocks = parseEditBlocks(diffOutput);
				if (blocks.length > 0) {
					const { code: patched, success } = applyEditBlocks(currentCode, blocks);
					if (success) finalCode = patched;
				}
			}

			if (finalCode === null) {
				// ── Phase 2: full regen ───────────────────────────────────────
				updateJob(jobId, { progress: 'Regenerating app…' });
				finalCode = '';

				if (isFullHtml(diffOutput)) {
					finalCode = stripDiffMarkers(diffOutput);
				} else {
					for await (const chunk of editApp(
						currentCode, editRequest, requirements, schema, url.origin, appId, uxSummaries, trackCost
					)) {
						finalCode += chunk;
					}
				}
			}

			// Safety: strip any stray diff markers before saving
			finalCode = stripDiffMarkers(finalCode);

			updateJob(jobId, { progress: 'Saving changes…' });

			const [summary] = await Promise.all([
				summaryPromise,
				writeGeneratedCode(
					auth, rootFolderId, appId, app.name, finalCode,
					app.folder_id, app.generated_code_doc_id || undefined
				)
			]);

			if (app.requirements_doc_id) {
				appendToRequirementsDoc(auth, app.requirements_doc_id, summary, new Date().toISOString()).catch(() => {});
			}

			await appendConversation(auth, rootFolderId, {
				app_id: appId,
				role: 'assistant',
				message: `Edit applied: ${editRequest}`,
				summary,
				created_at: new Date().toISOString()
			});

			if (totalCost > 0) await addAppSpend(auth, rootFolderId, appId, totalCost).catch(() => {});

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
