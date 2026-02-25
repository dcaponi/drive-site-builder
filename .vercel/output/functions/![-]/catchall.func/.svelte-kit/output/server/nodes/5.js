import * as server from '../entries/pages/serve/_appId_/_page.server.ts.js';

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/serve/_appId_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/serve/[appId]/+page.server.ts";
export const imports = ["_app/immutable/nodes/5.CK8H8F9b.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/chunks/BjfIHpTg.js","_app/immutable/chunks/DbznROE0.js","_app/immutable/chunks/CU1vI7_g.js","_app/immutable/chunks/c7Z7xhNj.js","_app/immutable/chunks/BWfAFAhF.js","_app/immutable/chunks/sDPbeqlu.js"];
export const stylesheets = ["_app/immutable/assets/ChatBubble.BOD4iSoN.css","_app/immutable/assets/5.b-cfcAC0.css"];
export const fonts = [];
