import * as server from '../entries/pages/app/_appId_/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/app/_appId_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/app/[appId]/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.Dk7Q2rD6.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/chunks/BjfIHpTg.js","_app/immutable/chunks/hVEil7zy.js","_app/immutable/chunks/CU1vI7_g.js","_app/immutable/chunks/sDPbeqlu.js","_app/immutable/chunks/c7Z7xhNj.js"];
export const stylesheets = ["_app/immutable/assets/3.CwHJJ-GS.css"];
export const fonts = [];
