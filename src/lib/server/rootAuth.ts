// Caches the root (admin) user's Google credentials server-side.
// Populated on every root-user request via hooks.server.ts.
// Used to perform Drive/Sheets operations on behalf of non-Google visitors.
//
// This works in a standard Node.js process (module state persists across requests).
// The root user must make at least one authenticated request before non-Google
// visitors can access protected content.

import type { SessionUser } from './auth.js';
import { getAuthedClient } from './auth.js';
import type { OAuth2Client } from 'google-auth-library';

let _rootUser: SessionUser | null = null;

export function setRootCredentials(user: SessionUser): void {
	_rootUser = user;
}

export function getRootClient(origin: string): OAuth2Client {
	if (!_rootUser) {
		throw new Error(
			'Root credentials not available — the admin user must log in at least once first.'
		);
	}
	return getAuthedClient(_rootUser, origin);
}

export function isRootAvailable(): boolean {
	return _rootUser !== null;
}
