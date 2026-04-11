// Multi-user credential cache + app/slug registry for tenant isolation.
// Replaces the old single-user "root credentials" approach.
//
// Credentials are persisted to .user-credentials.json and the app/slug
// registries to .app-registry.json so they survive server restarts.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import type { SessionUser } from './auth.js';
import { getAuthedClient } from './auth.js';
import type { OAuth2Client } from 'google-auth-library';

// ─── File paths ──────────────────────────────────────────────────────────────

const CRED_FILE = resolve('.user-credentials.json');
const REGISTRY_FILE = resolve('.app-registry.json');
const OLD_CRED_FILE = resolve('.root-credentials.json');

// ─── In-memory stores ───────────────────────────────────────────────────────

/** email → SessionUser */
const _credentials = new Map<string, SessionUser>();

/** appId → { ownerEmail, rootFolderId } */
const _appRegistry = new Map<string, { ownerEmail: string; rootFolderId: string }>();

/** "clientSlug/appSlug" → appId */
const _slugRegistry = new Map<string, string>();

let _loaded = false;

// ─── Persistence helpers ────────────────────────────────────────────────────

function loadFromDisk(): void {
	if (_loaded) return;
	_loaded = true;

	// Migrate old single-user credentials if the new file doesn't exist yet
	if (!existsSync(CRED_FILE) && existsSync(OLD_CRED_FILE)) {
		try {
			const raw = readFileSync(OLD_CRED_FILE, 'utf-8');
			const user = JSON.parse(raw) as SessionUser;
			_credentials.set(user.email.toLowerCase(), user);
			persistCredentials();
		} catch {
			// Ignore — old file is malformed
		}
	}

	// Load user credentials
	try {
		const raw = readFileSync(CRED_FILE, 'utf-8');
		const obj = JSON.parse(raw) as Record<string, SessionUser>;
		for (const [email, user] of Object.entries(obj)) {
			_credentials.set(email.toLowerCase(), user);
		}
	} catch {
		// File doesn't exist yet or is unreadable
	}

	// Load app + slug registries
	try {
		const raw = readFileSync(REGISTRY_FILE, 'utf-8');
		const obj = JSON.parse(raw) as {
			apps?: Record<string, { ownerEmail: string; rootFolderId: string }>;
			slugs?: Record<string, string>;
		};
		if (obj.apps) {
			for (const [appId, info] of Object.entries(obj.apps)) {
				_appRegistry.set(appId, info);
			}
		}
		if (obj.slugs) {
			for (const [slug, appId] of Object.entries(obj.slugs)) {
				_slugRegistry.set(slug, appId);
			}
		}
	} catch {
		// File doesn't exist yet
	}
}

function persistCredentials(): void {
	try {
		const obj: Record<string, SessionUser> = {};
		for (const [email, user] of _credentials) {
			obj[email] = user;
		}
		writeFileSync(CRED_FILE, JSON.stringify(obj, null, 2), { mode: 0o600 });
	} catch {
		// Non-fatal
	}
}

function persistRegistry(): void {
	try {
		const apps: Record<string, { ownerEmail: string; rootFolderId: string }> = {};
		for (const [appId, info] of _appRegistry) {
			apps[appId] = info;
		}
		const slugs: Record<string, string> = {};
		for (const [slug, appId] of _slugRegistry) {
			slugs[slug] = appId;
		}
		writeFileSync(REGISTRY_FILE, JSON.stringify({ apps, slugs }, null, 2), { mode: 0o600 });
	} catch {
		// Non-fatal
	}
}

// ─── Public API: credentials ────────────────────────────────────────────────

export function setUserCredentials(user: SessionUser): void {
	loadFromDisk();
	_credentials.set(user.email.toLowerCase(), user);
	persistCredentials();
}

export function getUserClient(email: string, origin: string): OAuth2Client {
	loadFromDisk();
	const user = _credentials.get(email.toLowerCase());
	if (!user) {
		throw new Error(
			`Credentials not available for ${email} — that user must log in at least once first.`
		);
	}
	const client = getAuthedClient(user, origin);

	// Persist refreshed tokens so the stored access_token stays fresh
	client.on('tokens', (tokens) => {
		let changed = false;
		if (tokens.access_token) {
			user.access_token = tokens.access_token;
			changed = true;
		}
		if (tokens.expiry_date) {
			user.expiry_date = tokens.expiry_date;
			changed = true;
		}
		if (tokens.refresh_token) {
			user.refresh_token = tokens.refresh_token;
			changed = true;
		}
		if (changed) {
			_credentials.set(email.toLowerCase(), user);
			persistCredentials();
		}
	});

	return client;
}

export function getUserSession(email: string): SessionUser | null {
	loadFromDisk();
	return _credentials.get(email.toLowerCase()) ?? null;
}

export function isAnyUserAvailable(): boolean {
	loadFromDisk();
	return _credentials.size > 0;
}

/** Get the first available user's email (for home-app resolution). */
export function getFirstUserEmail(): string | null {
	loadFromDisk();
	const first = _credentials.keys().next();
	return first.done ? null : first.value;
}

// ─── Public API: app registry ───────────────────────────────────────────────

export function registerAppOwner(
	appId: string,
	ownerEmail: string,
	rootFolderId: string
): void {
	loadFromDisk();
	_appRegistry.set(appId, { ownerEmail: ownerEmail.toLowerCase(), rootFolderId });
	persistRegistry();
}

export function registerSlug(
	clientSlug: string,
	appSlug: string,
	appId: string
): void {
	if (!clientSlug || !appSlug) return;
	loadFromDisk();
	_slugRegistry.set(`${clientSlug}/${appSlug}`, appId);
	persistRegistry();
}

export function unregisterApp(appId: string): void {
	loadFromDisk();
	_appRegistry.delete(appId);
	persistRegistry();
}

export function unregisterSlug(clientSlug: string, appSlug: string): void {
	if (!clientSlug || !appSlug) return;
	loadFromDisk();
	_slugRegistry.delete(`${clientSlug}/${appSlug}`);
	persistRegistry();
}

export function lookupApp(
	appId: string
): { ownerEmail: string; rootFolderId: string } | null {
	loadFromDisk();
	return _appRegistry.get(appId) ?? null;
}

export function lookupSlug(
	clientSlug: string,
	appSlug: string
): string | null {
	loadFromDisk();
	return _slugRegistry.get(`${clientSlug}/${appSlug}`) ?? null;
}

// ─── Backwards compatibility ────────────────────────────────────────────────
// These wrappers let older code continue working during transition.

/** @deprecated Use getUserClient or lookupApp instead */
export function getRootClient(origin: string): OAuth2Client {
	loadFromDisk();
	const firstEmail = getFirstUserEmail();
	if (!firstEmail) {
		throw new Error('No credentials available — an admin user must log in first.');
	}
	return getUserClient(firstEmail, origin);
}

/** @deprecated Use isAnyUserAvailable instead */
export function isRootAvailable(): boolean {
	return isAnyUserAvailable();
}
