import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { error, fail } from '@sveltejs/kit';
import { getAuthedClient } from '$lib/server/auth.js';
import { getAppById, getAppSchema, getAppFeedbacks, setHomeApp } from '$lib/server/sheets.js';
import { readRequirementsDoc } from '$lib/server/drive.js';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	const user = locals.user as SessionUser;
	const auth = getAuthedClient(user, url.origin);

	const app = await getAppById(auth, params.appId!);
	if (!app) throw error(404, 'App not found');

	const [requirements, schema, feedbacks] = await Promise.all([
		readRequirementsDoc(auth, app.requirements_doc_id).catch(() => ''),
		getAppSchema(auth, app.database_sheet_id).catch(() => []),
		getAppFeedbacks(auth, params.appId!).catch(() => [])
	]);

	return { app, requirements, schema, feedbacks };
};

export const actions: Actions = {
	setHome: async ({ locals, params, url }) => {
		const user = locals.user as SessionUser;
		const auth = getAuthedClient(user, url.origin);

		try {
			await setHomeApp(auth, params.appId!);
			return { success: true };
		} catch (err) {
			return fail(400, { error: err instanceof Error ? err.message : 'Failed to set home app' });
		}
	}
};
