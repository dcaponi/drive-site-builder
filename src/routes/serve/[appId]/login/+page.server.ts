import type { PageServerLoad, Actions } from './$types';
import type { SessionUser } from '$lib/server/auth.js';
import { lookupApp, getUserClient } from '$lib/server/rootAuth.js';
import { getAppById, findAppUser, updateAppUser } from '$lib/server/sheets.js';
import {
	hashPassword,
	verifyPassword,
	signUserToken,
	verifyUserToken,
	userCookieName
} from '$lib/server/userAuth.js';
import { error, redirect, fail } from '@sveltejs/kit';

const USER_COOKIE_MAX_AGE = 90 * 24 * 3600;

export const load: PageServerLoad = async ({ params, locals, url, cookies }) => {
	const reg = lookupApp(params.appId!);
	if (!reg) throw error(503, 'App owner must log in first');

	const auth = getUserClient(reg.ownerEmail, url.origin);
	const app = await getAppById(auth, reg.rootFolderId, params.appId!);
	if (!app) throw error(404, 'App not found');

	// If already logged in, redirect to the app
	const userToken = cookies.get(userCookieName(app.id));
	if (userToken) {
		const { valid } = await verifyUserToken(userToken, app.id);
		if (valid) throw redirect(302, `/serve/${app.id}`);
	}

	return { app };
};

export const actions: Actions = {
	login: async ({ params, url, request, cookies }) => {
		const reg = lookupApp(params.appId!);
		if (!reg) return fail(503, { error: 'App owner must log in first' });

		const auth = getUserClient(reg.ownerEmail, url.origin);
		const app = await getAppById(auth, reg.rootFolderId, params.appId!);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const confirmPassword = String(data.get('confirm_password') ?? '');

		if (!email) return fail(400, { error: 'Email is required' });
		if (!password) return fail(400, { error: 'Password is required' });

		// Find user in _users
		const appUser = await findAppUser(auth, reg.rootFolderId, params.appId!, email);
		if (!appUser) return fail(401, { error: 'No account found for this email' });

		// First login — no password set yet
		if (!appUser.password_hash) {
			// If no confirm_password submitted, ask for it
			if (!confirmPassword) {
				return fail(400, { needsConfirm: true, email, error: 'Please set a password for your account' });
			}
			// Validate passwords match
			if (password !== confirmPassword) {
				return fail(400, { needsConfirm: true, email, error: 'Passwords do not match' });
			}
			// Hash and save
			const hash = hashPassword(password);
			await updateAppUser(auth, reg.rootFolderId, params.appId!, appUser.id, { password_hash: hash });

			const token = await signUserToken(params.appId!, appUser.id, appUser.email, appUser.role, appUser.can_chat);
			cookies.set(userCookieName(params.appId!), token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: USER_COOKIE_MAX_AGE
			});
			throw redirect(302, `/serve/${params.appId!}`);
		}

		// Subsequent login — verify password
		if (!verifyPassword(password, appUser.password_hash)) {
			return fail(401, { error: 'Invalid password' });
		}

		const token = await signUserToken(params.appId!, appUser.id, appUser.email, appUser.role, appUser.can_chat);
		cookies.set(userCookieName(params.appId!), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});
		throw redirect(302, `/serve/${params.appId!}`);
	},

	logout: async ({ params, cookies }) => {
		cookies.delete(userCookieName(params.appId!), { path: '/' });
		throw redirect(302, `/serve/${params.appId!}/login`);
	}
};
