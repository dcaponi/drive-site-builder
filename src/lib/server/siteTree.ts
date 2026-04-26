// Recursive crawl of an app's Drive folder tree.
// Each folder becomes a route segment (folder name verbatim, must be url-safe).
// Each folder may contain its own requirements doc and content.md;
// missing requirements inherits from the nearest ancestor; root requirements
// always feeds the prompt as a style guide.

import type { OAuth2Client } from 'google-auth-library';
import { getDrive } from './google.js';
import { readRequirementsDoc } from './drive.js';
import { readMarkdownFile, findMarkdownFile } from './markdown.js';

const DRIVE_PARAMS = {
	supportsAllDrives: true,
	includeItemsFromAllDrives: true
} as const;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const RESERVED = new Set(['api', 'serve', 'auth', 'app', 'dashboard', 'login']);

export function validateRouteName(name: string): { valid: boolean; reason: string | null } {
	if (!name) return { valid: false, reason: 'empty folder name' };
	if (RESERVED.has(name)) return { valid: false, reason: `"${name}" is reserved by the platform` };
	if (!SLUG_RE.test(name)) {
		if (/[A-Z]/.test(name)) return { valid: false, reason: 'uppercase not allowed (use lowercase)' };
		if (/\s/.test(name)) return { valid: false, reason: 'spaces not allowed (use hyphens)' };
		if (/_/.test(name)) return { valid: false, reason: 'underscores not allowed (use hyphens)' };
		if (/^-|-$/.test(name)) return { valid: false, reason: 'cannot start or end with a hyphen' };
		return { valid: false, reason: 'only lowercase letters, digits, and internal hyphens allowed' };
	}
	return { valid: true, reason: null };
}

export interface RawNode {
	folderId: string;
	folderName: string;
	path: string;             // "/", "/blog", "/blog/post-1"
	nameValid: boolean;
	nameError: string | null;
	requirementsDocId: string | null;  // Google Doc named "requirements" (case-insensitive)
	requirementsMdId: string | null;   // .md file named "requirements" (preferred over Doc when both exist)
	contentMdId: string | null;        // .md file with main page content
	children: RawNode[];
}

export interface ResolvedNode {
	folderId: string;
	folderName: string;
	path: string;
	nameValid: boolean;
	nameError: string | null;
	hasOwnRequirements: boolean;
	hasContent: boolean;
	requirements: string;     // effective: own or inherited
	rootStyleGuide: string;   // always = root.requirements (raw)
	content: string;          // own content.md, never inherited
	children: ResolvedNode[];
}

export interface RouteEntry {
	path: string;
	title: string;
	valid: boolean;
}

// ─── Crawl ───────────────────────────────────────────────────────────────────

export async function scanSiteTree(
	auth: OAuth2Client,
	rootFolderId: string
): Promise<RawNode> {
	return crawlFolder(auth, rootFolderId, '', '', true);
}

async function crawlFolder(
	auth: OAuth2Client,
	folderId: string,
	folderName: string,
	parentPath: string,
	isRoot: boolean
): Promise<RawNode> {
	const drive = getDrive(auth);
	const res = await drive.files.list({
		q: `'${folderId}' in parents and trashed = false`,
		fields: 'files(id,name,mimeType)',
		orderBy: 'name',
		...DRIVE_PARAMS
	});
	const files = res.data.files ?? [];

	const docs = files.filter((f) => f.mimeType === 'application/vnd.google-apps.document');
	const subFolders = files.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');

	// Requirements doc (legacy: any Google Doc whose name contains "requirements", or first doc)
	const reqDoc =
		docs.find((f) => /requirements?/i.test(f.name ?? '')) ?? null;

	// .md files: requirements.md and content.md
	const requirementsMd = findMarkdownFile(files, /^requirements?$/i);
	const contentMd = findMarkdownFile(files, /^content$/i);

	let path: string;
	let nameValid: boolean;
	let nameError: string | null;
	if (isRoot) {
		path = '/';
		nameValid = true;
		nameError = null;
	} else {
		const v = validateRouteName(folderName);
		nameValid = v.valid;
		nameError = v.reason;
		path = parentPath === '/' ? `/${folderName}` : `${parentPath}/${folderName}`;
	}

	const children: RawNode[] = [];
	for (const sub of subFolders) {
		const child = await crawlFolder(auth, sub.id!, sub.name ?? '', path, false);
		children.push(child);
	}

	return {
		folderId,
		folderName: isRoot ? '' : folderName,
		path,
		nameValid,
		nameError,
		requirementsDocId: reqDoc?.id ?? null,
		requirementsMdId: requirementsMd?.id ?? null,
		contentMdId: contentMd?.id ?? null,
		children
	};
}

// ─── Inheritance + content load ──────────────────────────────────────────────

export async function resolveTree(
	auth: OAuth2Client,
	raw: RawNode
): Promise<ResolvedNode> {
	// Read every requirements + content file in parallel up front.
	const requirementsByPath = new Map<string, string>();
	const contentByPath = new Map<string, string>();
	const reads: Promise<void>[] = [];

	const visit = (n: RawNode) => {
		if (n.requirementsMdId) {
			reads.push(
				readMarkdownFile(auth, n.requirementsMdId)
					.then((t) => { requirementsByPath.set(n.path, t); })
					.catch(() => { /* missing/inaccessible — leave unset */ })
			);
		} else if (n.requirementsDocId) {
			reads.push(
				readRequirementsDoc(auth, n.requirementsDocId)
					.then((t) => { requirementsByPath.set(n.path, t); })
					.catch(() => { /* ignore */ })
			);
		}
		if (n.contentMdId) {
			reads.push(
				readMarkdownFile(auth, n.contentMdId)
					.then((t) => { contentByPath.set(n.path, t); })
					.catch(() => { /* ignore */ })
			);
		}
		for (const c of n.children) visit(c);
	};
	visit(raw);
	await Promise.all(reads);

	const rootRequirements = requirementsByPath.get('/') ?? '';

	const resolve = (n: RawNode, inheritedRequirements: string): ResolvedNode => {
		const own = requirementsByPath.get(n.path);
		const effective = own ?? inheritedRequirements;
		return {
			folderId: n.folderId,
			folderName: n.folderName,
			path: n.path,
			nameValid: n.nameValid,
			nameError: n.nameError,
			hasOwnRequirements: own !== undefined,
			hasContent: contentByPath.has(n.path),
			requirements: effective,
			rootStyleGuide: rootRequirements,
			content: contentByPath.get(n.path) ?? '',
			children: n.children.map((c) => resolve(c, effective))
		};
	};

	return resolve(raw, rootRequirements);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function findNodeByPath(root: ResolvedNode, path: string): ResolvedNode | null {
	const norm = normalizePath(path);
	if (norm === root.path) return root;
	for (const c of root.children) {
		const hit = findNodeByPath(c, norm);
		if (hit) return hit;
	}
	return null;
}

export function normalizePath(p: string): string {
	if (!p || p === '/' || p === '') return '/';
	const clean = p.replace(/^\/+|\/+$/g, '');
	return clean ? `/${clean}` : '/';
}

/** Flatten the tree into a route manifest the LLM can use for navigation. */
export function buildRouteManifest(root: ResolvedNode): RouteEntry[] {
	const out: RouteEntry[] = [];
	const visit = (n: ResolvedNode) => {
		out.push({
			path: n.path,
			title: n.folderName || 'Home',
			valid: n.nameValid
		});
		for (const c of n.children) visit(c);
	};
	visit(root);
	return out.filter((e) => e.valid);
}

/** All descendants (including self) of a given node, in pre-order. */
export function descendants(node: ResolvedNode): ResolvedNode[] {
	const out: ResolvedNode[] = [];
	const visit = (n: ResolvedNode) => {
		out.push(n);
		for (const c of n.children) visit(c);
	};
	visit(node);
	return out;
}

/** Path → safe filename slug for storage ("/" → "index", "/blog/post-1" → "blog__post-1"). */
export function pathToSlug(path: string): string {
	const norm = normalizePath(path);
	if (norm === '/') return 'index';
	return norm.replace(/^\//, '').replace(/\//g, '__');
}
