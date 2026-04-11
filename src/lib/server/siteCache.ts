// Local disk cache for app configs and generated HTML.
// Populated on every successful Google API read/write so sites
// can be served even when Google credentials are expired.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { AppConfig } from '../types.js';
import { PERSIST_DIR } from './paths.js';

const CACHE_DIR = join(PERSIST_DIR, '.site-cache');
const CONFIG_FILE = join(CACHE_DIR, 'apps.json');
const HTML_DIR = join(CACHE_DIR, 'html');

function ensureDir(dir: string): void {
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function safeFilename(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ─── App config cache ───────────────────────────────────────────────────────

let _configs: Map<string, AppConfig> | null = null;

function loadConfigs(): Map<string, AppConfig> {
	if (_configs) return _configs;
	_configs = new Map();
	try {
		const raw = readFileSync(CONFIG_FILE, 'utf-8');
		const obj = JSON.parse(raw) as Record<string, AppConfig>;
		for (const [id, config] of Object.entries(obj)) {
			_configs.set(id, config);
		}
	} catch { /* not yet cached */ }
	return _configs;
}

export function cacheAppConfigs(apps: AppConfig[]): void {
	ensureDir(CACHE_DIR);
	const cache = loadConfigs();
	for (const app of apps) {
		cache.set(app.id, app);
	}
	try {
		const obj: Record<string, AppConfig> = {};
		for (const [id, config] of cache) {
			obj[id] = config;
		}
		writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2));
	} catch { /* non-fatal */ }
}

export function getCachedApp(appId: string): AppConfig | null {
	return loadConfigs().get(appId) ?? null;
}

export function getCachedAppBySlug(clientSlug: string, appSlug: string): AppConfig | null {
	for (const app of loadConfigs().values()) {
		if (app.client_slug === clientSlug && app.app_slug === appSlug) return app;
	}
	return null;
}

export function getCachedHomeApp(): AppConfig | null {
	for (const app of loadConfigs().values()) {
		if (app.is_home) return app;
	}
	return null;
}

// ─── HTML cache ─────────────────────────────────────────────────────────────

export function cacheHtml(appId: string, html: string): void {
	ensureDir(HTML_DIR);
	try {
		writeFileSync(join(HTML_DIR, `${safeFilename(appId)}.html`), html);
	} catch { /* non-fatal */ }
}

export function getCachedHtml(appId: string): string | null {
	try {
		return readFileSync(join(HTML_DIR, `${safeFilename(appId)}.html`), 'utf-8');
	} catch {
		return null;
	}
}
