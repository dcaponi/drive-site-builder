import { SignJWT } from 'jose';
import type { BrowserContext } from '@playwright/test';

const JWT_SECRET = 'test-secret';

function getSecret() {
	return new TextEncoder().encode(JWT_SECRET);
}

function getAppSecret(appId: string) {
	return new TextEncoder().encode(`${JWT_SECRET}:${appId}`);
}

/**
 * Mint and set a session JWT cookie so the user is treated as a Google-authed root user.
 */
export async function setRootSession(
	context: BrowserContext,
	email: string,
	rootFolderId: string
): Promise<void> {
	const token = await new SignJWT({
		email,
		name: email.split('@')[0],
		picture: '',
		access_token: 'mock-access-token',
		refresh_token: 'mock-refresh-token',
		expiry_date: Date.now() + 3600 * 1000,
		root_folder_id: rootFolderId
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('30d')
		.sign(getSecret());

	await context.addCookies([
		{
			name: 'session',
			value: token,
			domain: 'localhost',
			path: '/'
		}
	]);
}

/**
 * Mint and set an app-level JWT cookie.
 */
export async function setAppToken(
	context: BrowserContext,
	appId: string,
	role: 'app-owner' | 'public',
	canChat: boolean = role === 'app-owner'
): Promise<void> {
	const token = await new SignJWT({ appId, role, can_chat: canChat })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('90d')
		.sign(getAppSecret(appId));

	const cookieName = `app_${appId.replace(/[^a-zA-Z0-9]/g, '_')}`;

	await context.addCookies([
		{
			name: cookieName,
			value: token,
			domain: 'localhost',
			path: '/'
		}
	]);
}
