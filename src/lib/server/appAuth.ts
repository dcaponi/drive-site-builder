import { SignJWT, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

export type AppRole = 'app-owner' | 'public';

const TOKEN_MAX_AGE = 90 * 24 * 3600; // 90 days

function getAppSecret(appId: string): Uint8Array {
	const base = env.JWT_SECRET;
	if (!base) throw new Error('JWT_SECRET is not set');
	return new TextEncoder().encode(`${base}:${appId}`);
}

export function appCookieName(appId: string): string {
	return `app_${appId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

export async function signAppToken(appId: string, role: AppRole, canChat?: boolean): Promise<string> {
	return new SignJWT({ appId, role, can_chat: canChat ?? (role === 'app-owner') })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${TOKEN_MAX_AGE}s`)
		.sign(getAppSecret(appId));
}

export async function verifyAppToken(
	token: string,
	appId: string
): Promise<{ valid: boolean; role: AppRole; can_chat: boolean }> {
	try {
		const { payload } = await jwtVerify(token, getAppSecret(appId));
		if (payload.appId !== appId) return { valid: false, role: 'public', can_chat: false };
		const role: AppRole = payload.role === 'app-owner' ? 'app-owner' : 'public';
		const can_chat = payload.can_chat === true;
		return { valid: true, role, can_chat };
	} catch {
		return { valid: false, role: 'public', can_chat: false };
	}
}
