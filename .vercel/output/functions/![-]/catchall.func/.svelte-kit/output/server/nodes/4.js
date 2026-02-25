import * as server from '../entries/pages/dashboard/_page.server.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/dashboard/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/dashboard/+page.server.ts";
export const imports = ["_app/immutable/nodes/4.Do2B1R9E.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/chunks/BjfIHpTg.js","_app/immutable/chunks/hVEil7zy.js","_app/immutable/chunks/CU1vI7_g.js","_app/immutable/chunks/8XCcLjZJ.js","_app/immutable/chunks/sDPbeqlu.js","_app/immutable/chunks/CZl678zF.js","_app/immutable/chunks/DMEKpxrw.js"];
export const stylesheets = ["_app/immutable/assets/4.CDlqHFPH.css"];
export const fonts = [];
