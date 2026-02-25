import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';

const TOKEN_MAX_AGE = 90 * 24 * 3600; // 90 days

// ─── Cookie name ──────────────────────────────────────────────────────────────

export function userCookieName(appId: string): string {
	return `app_user_${appId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}

// ─── Password hashing ─────────────────────────────────────────────────────────

export function hashPassword(pw: string): string {
	const salt = randomBytes(16).toString('hex');
	const hash = scryptSync(pw, salt, 64).toString('hex');
	return `${salt}:${hash}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
	const [salt, storedHash] = stored.split(':');
	if (!salt || !storedHash) return false;
	try {
		const hash = scryptSync(pw, salt, 64);
		const storedHashBuf = Buffer.from(storedHash, 'hex');
		return timingSafeEqual(hash, storedHashBuf);
	} catch {
		return false;
	}
}

// ─── User JWTs ────────────────────────────────────────────────────────────────

function getUserSecret(appId: string): Uint8Array {
	const base = env.JWT_SECRET;
	if (!base) throw new Error('JWT_SECRET is not set');
	return new TextEncoder().encode(`${base}${appId}_users`);
}

export async function signUserToken(
	appId: string,
	userId: string,
	email: string
): Promise<string> {
	return new SignJWT({ appId, userId, email })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime(`${TOKEN_MAX_AGE}s`)
		.sign(getUserSecret(appId));
}

export async function verifyUserToken(
	token: string,
	appId: string
): Promise<{ valid: boolean; userId: string; email: string }> {
	try {
		const { payload } = await jwtVerify(token, getUserSecret(appId));
		if (payload.appId !== appId) return { valid: false, userId: '', email: '' };
		return {
			valid: true,
			userId: String(payload.userId ?? ''),
			email: String(payload.email ?? '')
		};
	} catch {
		return { valid: false, userId: '', email: '' };
	}
}
