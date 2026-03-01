import type { OAuth2Client } from 'google-auth-library';

// When TEST_MODE is set, use in-memory mock implementations instead of real Google APIs.
// We use top-level await to conditionally import the correct module.

const TEST_MODE = typeof process !== 'undefined' && process.env.TEST_MODE === '1';

let _getDrive: (auth: OAuth2Client) => ReturnType<typeof import('googleapis').google.drive>;
let _getSheets: (auth: OAuth2Client) => ReturnType<typeof import('googleapis').google.sheets>;
let _getDocs: (auth: OAuth2Client) => ReturnType<typeof import('googleapis').google.docs>;

if (TEST_MODE) {
	const mock = await import('./google.mock.js');
	_getDrive = (auth) => mock.getMockDrive(auth) as any;
	_getSheets = (auth) => mock.getMockSheets(auth) as any;
	_getDocs = (auth) => mock.getMockDocs(auth) as any;
} else {
	const { google } = await import('googleapis');
	const { wrapWithRetry } = await import('./retry.js');
	_getDrive = (auth) => wrapWithRetry(google.drive({ version: 'v3', auth }));
	_getSheets = (auth) => wrapWithRetry(google.sheets({ version: 'v4', auth }));
	_getDocs = (auth) => wrapWithRetry(google.docs({ version: 'v1', auth }));
}

export const getDrive = _getDrive;
export const getSheets = _getSheets;
export const getDocs = _getDocs;
