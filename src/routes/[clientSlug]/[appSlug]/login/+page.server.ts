import type { PageServerLoad, Actions } from './$types';
import { lookupApp, lookupSlug, getUserClient } from '$lib/server/rootAuth.js';
import { getAppBySlug, findAppUser, updateAppUser } from '$lib/server/sheets.js';
import {
	hashPassword,
	verifyPassword,
	signUserToken,
	verifyUserToken,
	userCookieName
} from '$lib/server/userAuth.js';
import { error, redirect, fail } from '@sveltejs/kit';

const USER_COOKIE_MAX_AGE = 90 * 24 * 3600;

function resolveReg(clientSlug: string, appSlug: string) {
	const appId = lookupSlug(clientSlug, appSlug);
	if (!appId) return null;
	const reg = lookupApp(appId);
	if (!reg) return null;
	return { ...reg, appId };
}

export const load: PageServerLoad = async ({ params, url, cookies }) => {
	const resolved = resolveReg(params.clientSlug, params.appSlug);
	if (!resolved) throw error(503, 'App owner must log in first');

	const auth = getUserClient(resolved.ownerEmail, url.origin);
	const app = await getAppBySlug(auth, resolved.rootFolderId, params.clientSlug, params.appSlug);
	if (!app) throw error(404, 'App not found');

	const userToken = cookies.get(userCookieName(app.id));
	if (userToken) {
		const { valid } = await verifyUserToken(userToken, app.id);
		if (valid) throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
	}

	return { app };
};

export const actions: Actions = {
	login: async ({ params, url, request, cookies }) => {
		const resolved = resolveReg(params.clientSlug, params.appSlug);
		if (!resolved) return fail(503, { error: 'App owner must log in first' });

		const auth = getUserClient(resolved.ownerEmail, url.origin);
		const app = await getAppBySlug(auth, resolved.rootFolderId, params.clientSlug, params.appSlug);
		if (!app) return fail(404, { error: 'App not found' });

		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const password = String(data.get('password') ?? '');
		const confirmPassword = String(data.get('confirm_password') ?? '');

		if (!email) return fail(400, { error: 'Email is required' });
		if (!password) return fail(400, { error: 'Password is required' });

		const appUser = await findAppUser(auth, resolved.rootFolderId, app.id, email);
		if (!appUser) return fail(401, { error: 'No account found for this email' });

		// First login — no password set yet
		if (!appUser.password_hash) {
			if (!confirmPassword) {
				return fail(400, { needsConfirm: true, email, error: 'Please set a password for your account' });
			}
			if (password !== confirmPassword) {
				return fail(400, { needsConfirm: true, email, error: 'Passwords do not match' });
			}
			const hash = hashPassword(password);
			await updateAppUser(auth, resolved.rootFolderId, app.id, appUser.id, { password_hash: hash });

			const token = await signUserToken(app.id, appUser.id, appUser.email, appUser.role, appUser.can_chat);
			cookies.set(userCookieName(app.id), token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				maxAge: USER_COOKIE_MAX_AGE
			});
			throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
		}

		if (!verifyPassword(password, appUser.password_hash)) {
			return fail(401, { error: 'Invalid password' });
		}

		const token = await signUserToken(app.id, appUser.id, appUser.email, appUser.role, appUser.can_chat);
		cookies.set(userCookieName(app.id), token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: USER_COOKIE_MAX_AGE
		});
		throw redirect(302, `/${params.clientSlug}/${params.appSlug}`);
	},

	logout: async ({ params, url, cookies }) => {
		const resolved = resolveReg(params.clientSlug, params.appSlug);
		if (resolved) {
			const auth = getUserClient(resolved.ownerEmail, url.origin);
			const app = await getAppBySlug(auth, resolved.rootFolderId, params.clientSlug, params.appSlug);
			if (app) {
				cookies.delete(userCookieName(app.id), { path: '/' });
			}
		}
		throw redirect(302, `/${params.clientSlug}/${params.appSlug}/login`);
	}
};
