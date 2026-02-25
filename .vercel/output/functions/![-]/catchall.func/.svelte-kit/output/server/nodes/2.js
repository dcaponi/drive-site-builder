import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.0pFHBEj3.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/chunks/BjfIHpTg.js"];
export const stylesheets = ["_app/immutable/assets/2.drgjcJk0.css"];
export const fonts = [];
