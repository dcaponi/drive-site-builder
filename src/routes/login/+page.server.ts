import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) throw redirect(302, '/dashboard');
	return { error: url.searchParams.get('error') };
};
