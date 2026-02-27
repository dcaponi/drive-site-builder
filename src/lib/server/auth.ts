import { SignJWT, jwtVerify } from 'jose';
import { env } from '$env/dynamic/private';
import { google } from 'googleapis';

export interface SessionUser {
	email: string;
	name: string;
	picture: string;
	access_token: string;
	refresh_token: string;
	expiry_date: number;
}

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE = 30 * 24 * 3600; // 30 days

function getSecret() {
	const secret = env.JWT_SECRET;
	if (!secret) throw new Error('JWT_SECRET is not set');
	return new TextEncoder().encode(secret);
}

// ─── OAuth Client ────────────────────────────────────────────────────────────

export function getOAuthClient(origin: string) {
	return new google.auth.OAuth2(
		env.GOOGLE_CLIENT_ID,
		env.GOOGLE_CLIENT_SECRET,
		`${origin}/auth/callback`
	);
}

export function getAuthUrl(origin: string): string {
	const client = getOAuthClient(origin);
	return client.generateAuthUrl({
		access_type: 'offline',
		prompt: 'consent', // always get refresh_token
		scope: [
			'openid',
			'email',
			'profile',
			'https://www.googleapis.com/auth/drive',
			'https://www.googleapis.com/auth/spreadsheets',
			'https://www.googleapis.com/auth/documents'
		]
	});
}

export async function exchangeCode(
	code: string,
	origin: string
): Promise<SessionUser> {
	const client = getOAuthClient(origin);
	const { tokens } = await client.getToken(code);

	if (!tokens.access_token) throw new Error('No access token returned from Google');

	// Fetch user profile
	client.setCredentials(tokens);
	const oauth2 = google.oauth2({ version: 'v2', auth: client });
	const { data: profile } = await oauth2.userinfo.get();

	const raw = env.ALLOWED_EMAILS ?? env.ALLOWED_EMAIL ?? '';
	const allowedEmails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
	if (allowedEmails.length > 0 && !allowedEmails.includes(profile.email!.toLowerCase())) {
		throw new Error('Access restricted to whitelisted accounts.');
	}

	return {
		email: profile.email!,
		name: profile.name ?? profile.email!,
		picture: profile.picture ?? '',
		access_token: tokens.access_token,
		refresh_token: tokens.refresh_token ?? '',
		expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1000
	};
}

// ─── Session JWT ─────────────────────────────────────────────────────────────

export async function createSessionToken(user: SessionUser): Promise<string> {
	return new SignJWT({ ...user })
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('30d')
		.sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
	try {
		const { payload } = await jwtVerify(token, getSecret());
		return payload as unknown as SessionUser;
	} catch {
		return null;
	}
}

export function getTokenFromCookies(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader
		.split(';')
		.map((c) => c.trim().split('='))
		.find(([k]) => k === COOKIE_NAME);
	return match ? match.slice(1).join('=') : null;
}

export function makeSessionCookie(token: string): string {
	return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function clearSessionCookie(): string {
	return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

// ─── Refreshed Auth Client ───────────────────────────────────────────────────

export function getAuthedClient(user: SessionUser, origin: string) {
	const client = getOAuthClient(origin);
	client.setCredentials({
		access_token: user.access_token,
		refresh_token: user.refresh_token,
		expiry_date: user.expiry_date
	});
	return client;
}

export { COOKIE_NAME };
