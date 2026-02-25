import * as server from '../entries/pages/view/_appId_/_page.server.ts.js';

export const index = 6;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/view/_appId_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/view/[appId]/+page.server.ts";
export const imports = ["_app/immutable/nodes/6.DuB-V9zq.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/chunks/BjfIHpTg.js","_app/immutable/chunks/DbznROE0.js","_app/immutable/chunks/CU1vI7_g.js","_app/immutable/chunks/c7Z7xhNj.js","_app/immutable/chunks/BWfAFAhF.js","_app/immutable/chunks/sDPbeqlu.js"];
export const stylesheets = ["_app/immutable/assets/ChatBubble.BOD4iSoN.css","_app/immutable/assets/6.DYLTazqx.css"];
export const fonts = [];
