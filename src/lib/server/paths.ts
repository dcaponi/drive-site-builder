// Central resolved path for all persistent data (credentials, registry, cache).
// Set PERSIST_DIR env var to a volume mount path in production (e.g. /data).
// Defaults to the current working directory for local development.

import { resolve } from 'path';

export const PERSIST_DIR = resolve(process.env.PERSIST_DIR || '.');
