const BASE_URL = 'http://localhost:4173';

export async function resetMocks(opts: {
	rootFolderId: string;
	user: {
		email: string;
		name: string;
		picture: string;
		access_token: string;
		refresh_token: string;
		expiry_date: number;
		root_folder_id: string;
	};
}): Promise<void> {
	const res = await fetch(`${BASE_URL}/api/test/seed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'reset',
			rootFolderId: opts.rootFolderId,
			user: opts.user
		})
	});
	if (!res.ok) throw new Error(`Reset failed: ${res.status} ${await res.text()}`);
}

export async function seedMember(opts: {
	rootFolderId: string;
	appId: string;
	databaseSheetId: string;
	email: string;
	role?: 'owner' | 'member';
	canChat?: boolean;
	passwordHash?: string;
}): Promise<void> {
	const res = await fetch(`${BASE_URL}/api/test/seed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'seedMember',
			...opts
		})
	});
	if (!res.ok) throw new Error(`seedMember failed: ${res.status} ${await res.text()}`);
}

export async function seedApp(opts: {
	rootFolderId: string;
	appId: string;
	appName: string;
	folderId: string;
	requirementsDocId?: string;
	databaseSheetId?: string;
	generatedCodeDocId?: string;
	generatedCode?: string;
	membersOnly?: boolean;
	allowedDomains?: string[];
	ownerEmail?: string;
	clientSlug?: string;
	appSlug?: string;
	isHome?: boolean;
}): Promise<void> {
	const res = await fetch(`${BASE_URL}/api/test/seed`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			action: 'seedApp',
			...opts
		})
	});
	if (!res.ok) throw new Error(`seedApp failed: ${res.status} ${await res.text()}`);
}
