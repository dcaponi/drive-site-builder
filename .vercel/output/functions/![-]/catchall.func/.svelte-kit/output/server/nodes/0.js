import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.BAiX1T7O.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/chunks/BjfIHpTg.js","_app/immutable/chunks/DbznROE0.js","_app/immutable/chunks/CU1vI7_g.js","_app/immutable/chunks/8XCcLjZJ.js","_app/immutable/chunks/SXs_gYjT.js","_app/immutable/chunks/CZl678zF.js","_app/immutable/chunks/DMEKpxrw.js"];
export const stylesheets = ["_app/immutable/assets/0.Dw9-ykM8.css"];
export const fonts = [];
