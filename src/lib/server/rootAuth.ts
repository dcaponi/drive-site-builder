// Caches the root (admin) user's Google credentials server-side.
// Populated on every root-user request via hooks.server.ts.
// Used to perform Drive/Sheets operations on behalf of non-Google visitors.
//
// Credentials are persisted to .root-credentials.json so they survive server
// restarts. The root user only needs to log in once; the refresh token handles
// re-authentication automatically.

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { SessionUser } from './auth.js';
import { getAuthedClient } from './auth.js';
import type { OAuth2Client } from 'google-auth-library';

const CRED_FILE = resolve('.root-credentials.json');

let _rootUser: SessionUser | null = null;

/** Try loading persisted credentials from disk (runs once on first access). */
function loadFromDisk(): void {
	if (_rootUser) return;
	try {
		const raw = readFileSync(CRED_FILE, 'utf-8');
		_rootUser = JSON.parse(raw) as SessionUser;
	} catch {
		// File doesn't exist yet or is unreadable — that's fine.
	}
}

export function setRootCredentials(user: SessionUser): void {
	_rootUser = user;
	try {
		writeFileSync(CRED_FILE, JSON.stringify(user), { mode: 0o600 });
	} catch {
		// Non-fatal — in-memory cache still works for this process lifetime.
	}
}

export function getRootClient(origin: string): OAuth2Client {
	loadFromDisk();
	if (!_rootUser) {
		throw new Error(
			'Root credentials not available — the admin user must log in at least once first.'
		);
	}
	return getAuthedClient(_rootUser, origin);
}

export function isRootAvailable(): boolean {
	loadFromDisk();
	return _rootUser !== null;
}
