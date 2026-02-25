import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

// All Google API clients are scoped to the authenticated user's OAuth client.
// The auth client is obtained from the session on each request.

export function getDrive(auth: OAuth2Client) {
	return google.drive({ version: 'v3', auth });
}

export function getSheets(auth: OAuth2Client) {
	return google.sheets({ version: 'v4', auth });
}

export function getDocs(auth: OAuth2Client) {
	return google.docs({ version: 'v1', auth });
}
