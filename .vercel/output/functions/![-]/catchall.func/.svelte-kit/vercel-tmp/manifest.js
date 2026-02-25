export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.BH68Xv9G.js",app:"_app/immutable/entry/app.pEE7BoQr.js",imports:["_app/immutable/entry/start.BH68Xv9G.js","_app/immutable/chunks/CZl678zF.js","_app/immutable/chunks/DMEKpxrw.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/entry/app.pEE7BoQr.js","_app/immutable/chunks/BPIK9Xwi.js","_app/immutable/chunks/CWj6FrbW.js","_app/immutable/chunks/DMEKpxrw.js","_app/immutable/chunks/BjfIHpTg.js","_app/immutable/chunks/c7Z7xhNj.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js')),
			__memo(() => import('../output/server/nodes/4.js')),
			__memo(() => import('../output/server/nodes/5.js')),
			__memo(() => import('../output/server/nodes/6.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/apps/[appId]/build",
				pattern: /^\/api\/apps\/([^/]+?)\/build\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/apps/_appId_/build/_server.ts.js'))
			},
			{
				id: "/api/apps/[appId]/chat",
				pattern: /^\/api\/apps\/([^/]+?)\/chat\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/apps/_appId_/chat/_server.ts.js'))
			},
			{
				id: "/api/apps/[appId]/credentials",
				pattern: /^\/api\/apps\/([^/]+?)\/credentials\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/apps/_appId_/credentials/_server.ts.js'))
			},
			{
				id: "/api/apps/[appId]/feedback/[feedbackId]",
				pattern: /^\/api\/apps\/([^/]+?)\/feedback\/([^/]+?)\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false},{"name":"feedbackId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/apps/_appId_/feedback/_feedbackId_/_server.ts.js'))
			},
			{
				id: "/api/apps/[appId]/token",
				pattern: /^\/api\/apps\/([^/]+?)\/token\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/apps/_appId_/token/_server.ts.js'))
			},
			{
				id: "/api/crud/[appId]/[table]",
				pattern: /^\/api\/crud\/([^/]+?)\/([^/]+?)\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false},{"name":"table","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/crud/_appId_/_table_/_server.ts.js'))
			},
			{
				id: "/api/crud/[appId]/[table]/[id]",
				pattern: /^\/api\/crud\/([^/]+?)\/([^/]+?)\/([^/]+?)\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false},{"name":"table","optional":false,"rest":false,"chained":false},{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/crud/_appId_/_table_/_id_/_server.ts.js'))
			},
			{
				id: "/api/debug",
				pattern: /^\/api\/debug\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/debug/_server.ts.js'))
			},
			{
				id: "/app/[appId]",
				pattern: /^\/app\/([^/]+?)\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/auth/callback",
				pattern: /^\/auth\/callback\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/auth/callback/_server.ts.js'))
			},
			{
				id: "/auth/login",
				pattern: /^\/auth\/login\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/auth/login/_server.ts.js'))
			},
			{
				id: "/auth/logout",
				pattern: /^\/auth\/logout\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/auth/logout/_server.ts.js'))
			},
			{
				id: "/dashboard",
				pattern: /^\/dashboard\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/serve/[appId]",
				pattern: /^\/serve\/([^/]+?)\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			},
			{
				id: "/serve/[appId]/content",
				pattern: /^\/serve\/([^/]+?)\/content\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/serve/_appId_/content/_server.ts.js'))
			},
			{
				id: "/view/[appId]",
				pattern: /^\/view\/([^/]+?)\/?$/,
				params: [{"name":"appId","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 6 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
