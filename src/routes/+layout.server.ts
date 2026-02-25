import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user
			? { email: locals.user.email, name: locals.user.name, picture: locals.user.picture }
			: null
	};
};
