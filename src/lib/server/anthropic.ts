import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';
import type { TableSchema, AssetInfo, ScriptFile } from '../types.js';
import type { RouteEntry } from './siteTree.js';

let _client: Anthropic | null = null;

function getClient() {
	if (!_client) _client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	return _client;
}

// Detect rate-limit errors from Anthropic SDK
function isRateLimitError(err: unknown): boolean {
	if (err instanceof Anthropic.RateLimitError) return true;
	if (err instanceof Anthropic.APIError && err.status === 429) return true;
	return false;
}

// Extract wait time from error headers or use exponential backoff
function getRetryWaitMs(err: unknown, attempt: number): number {
	if (err instanceof Anthropic.APIError) {
		const retryAfter = err.headers?.['retry-after'];
		if (retryAfter) return Math.min(parseFloat(retryAfter) * 1000, 60_000);
	}
	return Math.min(1000 * 2 ** attempt, 30_000);
}

export type ProgressCallback = (message: string) => void;

// Retry helper for rate-limited API calls (429).
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, onProgress?: ProgressCallback): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err: unknown) {
			if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
			const waitMs = getRetryWaitMs(err, attempt);
			if (onProgress) onProgress(`Rate limited — retrying in ${Math.ceil(waitMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})…`);
			await new Promise((r) => setTimeout(r, waitMs));
		}
	}
}

// Streaming retry — wraps a stream-creating function with rate-limit retry.
// The stream's `response` promise resolves once the HTTP response arrives,
// surfacing any 429 before we start iterating events.
type MessageStream = ReturnType<InstanceType<typeof Anthropic>['messages']['stream']>;

async function withStreamRetry(
	fn: () => MessageStream,
	maxRetries = 3,
	onProgress?: ProgressCallback
): Promise<MessageStream> {
	for (let attempt = 0; ; attempt++) {
		try {
			const stream = fn();
			await stream.response;
			return stream;
		} catch (err: unknown) {
			if (!isRateLimitError(err) || attempt >= maxRetries) throw err;
			const waitMs = getRetryWaitMs(err, attempt);
			if (onProgress) onProgress(`Rate limited — retrying in ${Math.ceil(waitMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})…`);
			await new Promise((r) => setTimeout(r, waitMs));
		}
	}
}

const INITIAL_MODEL = 'claude-opus-4-6';
const EDIT_MODEL = 'claude-sonnet-4-6';

// Prices in USD per token (as of early 2026)
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
	'claude-opus-4-6':          { input: 15 / 1_000_000,  output: 75 / 1_000_000 },
	'claude-sonnet-4-6':        { input: 3  / 1_000_000,  output: 15 / 1_000_000 },
	'claude-haiku-4-5-20251001': { input: 0.8 / 1_000_000, output: 4  / 1_000_000 },
	'claude-haiku-4-5':          { input: 0.8 / 1_000_000, output: 4  / 1_000_000 }
};

export function calcCost(model: string, inputTokens: number, outputTokens: number): number {
	const prices = MODEL_PRICES[model] ?? MODEL_PRICES['claude-sonnet-4-6'];
	return prices.input * inputTokens + prices.output * outputTokens;
}

function schemaToDescription(tables: TableSchema[]): string {
	return tables
		.map((t) => {
			const cols = t.columns.map((c) => `  - ${c.name} (${c.type})`).join('\n');
			return `Table: ${t.name}\n${cols}`;
		})
		.join('\n\n');
}

function uxLessonsBlock(summaries: string[]): string {
	if (!summaries.length) return '';
	const lessons = summaries
		.slice(-20) // last 20 unique summaries
		.map((s, i) => `${i + 1}. ${s}`)
		.join('\n');
	return `\nUX lessons learned from past user feedback (apply these when generating the UI):\n${lessons}\n`;
}

function assetsBlock(assets: AssetInfo[], apiBase: string, appId: string): string {
	if (!assets.length) return '';
	const lines = assets.map(
		(a) => `  - "${a.name}" → ${apiBase}/api/apps/${appId}/assets/${a.id}`
	);
	return `\nCUSTOM ASSETS:
The app owner has uploaded image assets to the project folder. Use these in the app where they
make sense (e.g. logos, hero images, backgrounds, icons, illustrations). Reference them via their
URL — they are served from the same origin.

Available assets:
${lines.join('\n')}

Rules for assets:
- Use <img> tags with the full URL path (starting with /api/apps/${appId}/assets/).
- Always include descriptive alt text derived from the file name.
- Use assets where they naturally fit the requirements — don't force every image in if it doesn't make sense.
- You may use CSS background-image with url() for decorative/background use.
- Assets are served with proper caching headers, so no need to worry about performance.\n`;
}

function scriptsBlock(scripts: ScriptFile[]): string {
	if (!scripts.length) return '';
	const entries = scripts.map(
		(s) => `── ${s.name} ──\n${s.content}`
	);
	return `\nCUSTOM SCRIPTS:
The app owner has added custom JavaScript files to the project folder. These scripts will be
automatically injected into the app as <script> tags — you do NOT need to include their source
code in your output. However, the functions and variables they define are available for you to
call from your generated code. Here are the scripts and their contents so you know what's available:

${entries.join('\n\n')}

Rules for custom scripts:
- Do NOT reproduce the custom script code in your output — it is injected automatically.
- You MAY call any functions or reference any variables defined in these scripts from your own <script> code.
- The custom scripts are loaded before your <script type="module"> block, so their globals are available.\n`;
}

export interface PageContext {
	/** Style guide from the root requirements doc — always passed. */
	rootStyleGuide?: string;
	/** Markdown body for this page (from content.md). Empty string if none. */
	pageContent?: string;
	/** Full route manifest of the site so navigation can be rendered. */
	routes?: RouteEntry[];
	/** Path of the page being generated, e.g. "/", "/blog/post-1". */
	currentPath?: string;
}

function styleGuideBlock(rootStyleGuide?: string, currentPath?: string): string {
	if (!rootStyleGuide || currentPath === '/') return '';
	return `\nROOT STYLE GUIDE (inherited from the site root — apply unless this page's requirements override):\n${rootStyleGuide}\n`;
}

function pageContentBlock(pageContent?: string): string {
	if (!pageContent) return '';
	return `\nPAGE CONTENT (markdown — render this as the main body of the page, preserving structure and meaning):\n\`\`\`markdown\n${pageContent}\n\`\`\`\n`;
}

function routesBlock(routes?: RouteEntry[], currentPath?: string): string {
	if (!routes || routes.length === 0) return '';
	const lines = routes
		.map((r) => `  - ${r.path}${r.path === currentPath ? '  (current page)' : ''} — ${r.title}`)
		.join('\n');
	return `\nSITE NAVIGATION:
This page is part of a multi-page site. The full route map is below. Render navigation/links to the
other pages where it makes sense (e.g. a header nav for siblings, a list of children on a landing
page). Use plain anchor tags with absolute paths from the route map — the host page handles routing.

Routes:
${lines}\n`;
}

function buildSystemPrompt(
	requirements: string,
	tables: TableSchema[],
	apiBase: string,
	appId: string,
	uxSummaries: string[],
	assets: AssetInfo[] = [],
	scripts: ScriptFile[] = [],
	page: PageContext = {}
): string {
	return `You are an expert full-stack web developer. Your job is to generate a complete, single-file HTML web application.

REQUIREMENTS:
${requirements}
${styleGuideBlock(page.rootStyleGuide, page.currentPath)}${pageContentBlock(page.pageContent)}${routesBlock(page.routes, page.currentPath)}
DATABASE SCHEMA:
${schemaToDescription(tables)}

CRUD API (same-origin, JSON):
Base: ${apiBase}/api/crud/${appId}

Available endpoints for each table:
  GET    /api/crud/${appId}/{table}       → { data: [...records] }
  POST   /api/crud/${appId}/{table}       → { data: record }   body: JSON object
  GET    /api/crud/${appId}/{table}/{id}  → { data: record }
  PUT    /api/crud/${appId}/{table}/{id}  → { data: record }   body: JSON object (partial)
  DELETE /api/crud/${appId}/{table}/{id}  → { success: true }
${uxLessonsBlock(uxSummaries)}${assetsBlock(assets, apiBase, appId)}${scriptsBlock(scripts)}
USER AUTH API (if app has user system):
  POST   /api/apps/${appId}/users  (action: signup)  body: { email, password }  → 200 { userId, email } or 401
  POST   /api/apps/${appId}/users  (action: login)   body: { email, password }  → 200 { userId, email } or 401
  DELETE /api/apps/${appId}/users  (action: logout)  → 200
  GET    /api/apps/${appId}/users  (action: me)      → 200 { userId, email } or 401

USER DATA SCOPING:
- CRUD records with a 'user_id' column are automatically scoped to the logged-in user.
- If the user is not logged in (GET /me returns 401), store data in localStorage.
  Use key: "crud_${appId}_{tableName}" with JSON array of records.
- Provide sign-up/login UI if the app uses user accounts.

RULES:
- Output ONLY valid HTML. No markdown, no explanation, no code fences.
- Embed all CSS in a <style> tag and all JS in a <script type="module"> tag.
- Use the CRUD API endpoints above with fetch(). Handle loading and error states.
- Make the UI polished, responsive, and modern (use CSS custom properties, clean typography).
- Use semantic HTML. Prefer a card-based layout for lists. Forms should be inline where sensible.
- Auto-refresh data after mutations. Show user-friendly success/error toasts.
- The app must work without any build step or external dependencies beyond what a CDN provides.
- If the requirements mention charts or rich UI, use a CDN library (e.g. Chart.js from jsDelivr).

THIRD-PARTY API CREDENTIALS:
When building features that call third-party APIs, read credentials from localStorage using the
key pattern: credential_{service_name} (e.g. localStorage.getItem('credential_openai')).
The value is a JSON object: { value: string, type: 'api_key' | 'bearer_token' }.
Never hardcode API keys. If the credential is missing, show a user-friendly message like
"This feature requires configuration by the app owner" — do NOT prompt end users to enter
API keys unless the app owner explicitly asks for an end-user key input.`;
}

// ─── Build cost estimation ────────────────────────────────────────────────────
// Counts input tokens for the system+user prompt (server-side via Anthropic's
// count_tokens endpoint) and applies a fixed output budget per page so the UI
// can show a USD figure before kicking off a build.

const ESTIMATED_OUTPUT_TOKENS_PER_PAGE = 8000;

export async function estimateBuildCost(
	requirements: string,
	tables: TableSchema[],
	apiBase: string,
	appId: string,
	uxSummaries: string[],
	assets: AssetInfo[] = [],
	scripts: ScriptFile[] = [],
	page: PageContext = {}
): Promise<{ inputTokens: number; outputTokens: number; cost: number }> {
	const client = getClient();
	const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries, assets, scripts, page);

	const res = await withRetry(() => client.messages.countTokens({
		model: INITIAL_MODEL,
		system,
		messages: [
			{ role: 'user', content: 'Generate the complete HTML application now. Output only the HTML.' }
		]
	}));

	const inputTokens = res.input_tokens;
	const outputTokens = ESTIMATED_OUTPUT_TOKENS_PER_PAGE;
	const cost = calcCost(INITIAL_MODEL, inputTokens, outputTokens);
	return { inputTokens, outputTokens, cost };
}

// ─── Initial build (Opus 4.6) ─────────────────────────────────────────────────

export async function* generateApp(
	requirements: string,
	tables: TableSchema[],
	apiBase: string,
	appId: string,
	uxSummaries: string[],
	onCost?: (cost: number) => void,
	assets: AssetInfo[] = [],
	scripts: ScriptFile[] = [],
	onProgress?: ProgressCallback,
	page: PageContext = {}
): AsyncGenerator<string> {
	const client = getClient();
	const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries, assets, scripts, page);

	if (onProgress) onProgress('Waiting for Claude…');
	const stream = await withStreamRetry(() => client.messages.stream({
		model: INITIAL_MODEL,
		max_tokens: 64000,
		// @ts-expect-error - thinking is valid for Opus 4.6
		thinking: { type: 'adaptive' },
		system,
		messages: [
			{
				role: 'user',
				content: 'Generate the complete HTML application now. Output only the HTML.'
			}
		]
	}), 3, onProgress);

	for await (const event of stream) {
		if (
			event.type === 'content_block_delta' &&
			event.delta.type === 'text_delta'
		) {
			yield event.delta.text;
		}
	}

	const final = await stream.finalMessage();
	if (onCost) onCost(calcCost(INITIAL_MODEL, final.usage.input_tokens, final.usage.output_tokens));
	if (final.stop_reason === 'max_tokens') {
		yield '\n<!-- [TRUNCATED: output hit max_tokens limit — try rebuilding] -->';
	}
}

// ─── Continue a truncated build (Opus 4.6) ────────────────────────────────────

const TRUNCATION_MARKER = '<!-- [TRUNCATED:';

export function isTruncated(code: string): boolean {
	return code.includes(TRUNCATION_MARKER);
}

export function stripTruncationMarker(code: string): string {
	const idx = code.indexOf(TRUNCATION_MARKER);
	return idx === -1 ? code : code.slice(0, idx).trimEnd();
}

export async function* continueApp(
	partialCode: string,
	requirements: string,
	tables: TableSchema[],
	apiBase: string,
	appId: string,
	uxSummaries: string[],
	onCost?: (cost: number) => void,
	assets: AssetInfo[] = [],
	scripts: ScriptFile[] = [],
	onProgress?: ProgressCallback,
	page: PageContext = {}
): AsyncGenerator<string> {
	const client = getClient();
	const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries, assets, scripts, page);
	const clean = stripTruncationMarker(partialCode);

	if (onProgress) onProgress('Waiting for Claude…');
	const stream = await withStreamRetry(() => client.messages.stream({
		model: INITIAL_MODEL,
		max_tokens: 64000,
		// @ts-expect-error - thinking is valid for Opus 4.6
		thinking: { type: 'adaptive' },
		system,
		messages: [
			{
				role: 'user',
				content: `You previously started generating an HTML application but were cut off by the token limit. Here is the partial HTML output so far:\n\n${clean}\n\nContinue generating from exactly where you left off. Output ONLY the continuation — do not repeat anything already written. Output only valid HTML.`
			}
		]
	}), 3, onProgress);

	for await (const event of stream) {
		if (
			event.type === 'content_block_delta' &&
			event.delta.type === 'text_delta'
		) {
			yield event.delta.text;
		}
	}

	const final = await stream.finalMessage();
	if (onCost) onCost(calcCost(INITIAL_MODEL, final.usage.input_tokens, final.usage.output_tokens));
	if (final.stop_reason === 'max_tokens') {
		yield '\n<!-- [TRUNCATED: output hit max_tokens limit — try rebuilding] -->';
	}
}

// ─── Diff-based edit (Sonnet 4.6) ────────────────────────────────────────────
// Asks Claude to emit only SEARCH/REPLACE blocks instead of the full file.
// Much cheaper for small edits; the caller applies the diff and falls back to
// a full regeneration if any block fails to match.

const DIFF_SYSTEM_SUFFIX = `

DIFF EDITING RULES:
When asked to make changes, output ONLY search/replace diff blocks in this exact format — no other text:

<<<<<<< SEARCH
(exact lines from the current code, verbatim — same whitespace and quotes)
=======
(replacement lines)
>>>>>>> REPLACE

Rules:
- Include enough context lines (3–5) in SEARCH to uniquely identify the location.
- You may emit multiple blocks for multiple changes.
- Do NOT output the full HTML file unless instructed.
- If the change is so large that a diff would be unclear, output the full HTML file instead (starting with <!doctype html>).`;

export async function* generateEditDiff(
	currentCode: string,
	editRequest: string,
	requirements: string,
	tables: TableSchema[],
	apiBase: string,
	appId: string,
	uxSummaries: string[],
	onCost?: (cost: number) => void,
	assets: AssetInfo[] = [],
	scripts: ScriptFile[] = [],
	onProgress?: ProgressCallback,
	page: PageContext = {}
): AsyncGenerator<string> {
	const client = getClient();
	const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries, assets, scripts, page) + DIFF_SYSTEM_SUFFIX;

	if (onProgress) onProgress('Waiting for Claude…');
	const stream = await withStreamRetry(() => client.messages.stream({
		model: EDIT_MODEL,
		max_tokens: 32000,
		system,
		messages: [
			{
				role: 'user',
				content: `Here is the current generated application:\n\n${currentCode}\n\nEdit request: ${editRequest}\n\nOutput only SEARCH/REPLACE diff blocks (or the full HTML if the change is large).`
			}
		]
	}), 3, onProgress);

	for await (const event of stream) {
		if (
			event.type === 'content_block_delta' &&
			event.delta.type === 'text_delta'
		) {
			yield event.delta.text;
		}
	}

	const finalDiff = await stream.finalMessage();
	if (onCost) onCost(calcCost(EDIT_MODEL, finalDiff.usage.input_tokens, finalDiff.usage.output_tokens));
}

// ─── Edit request (Sonnet 4.6) ────────────────────────────────────────────────

export async function* editApp(
	currentCode: string,
	editRequest: string,
	requirements: string,
	tables: TableSchema[],
	apiBase: string,
	appId: string,
	uxSummaries: string[],
	onCost?: (cost: number) => void,
	assets: AssetInfo[] = [],
	scripts: ScriptFile[] = [],
	onProgress?: ProgressCallback,
	page: PageContext = {}
): AsyncGenerator<string> {
	const client = getClient();
	const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries, assets, scripts, page);

	if (onProgress) onProgress('Waiting for Claude…');
	const stream = await withStreamRetry(() => client.messages.stream({
		model: EDIT_MODEL,
		max_tokens: 64000,
		system,
		messages: [
			{
				role: 'user',
				content: `Here is the current generated application:\n\n${currentCode}\n\nEdit request: ${editRequest}\n\nOutput the complete updated HTML file. Output only the HTML, no explanation.`
			}
		]
	}), 3, onProgress);

	for await (const event of stream) {
		if (
			event.type === 'content_block_delta' &&
			event.delta.type === 'text_delta'
		) {
			yield event.delta.text;
		}
	}

	const final = await stream.finalMessage();
	if (onCost) onCost(calcCost(EDIT_MODEL, final.usage.input_tokens, final.usage.output_tokens));
	if (final.stop_reason === 'max_tokens') {
		yield '\n<!-- [TRUNCATED: output hit max_tokens limit — try editing again] -->';
	}
}

// ─── Intent classification (Haiku 4.5, fast) ─────────────────────────────────
// Returns 'update' for code changes, 'chat' for questions/conversation.

export async function classifyIntent(
	message: string,
	onCost?: (cost: number) => void
): Promise<'update' | 'chat'> {
	const client = getClient();
	const model = 'claude-haiku-4-5-20251001';
	const response = await withRetry(() => client.messages.create({
		model,
		max_tokens: 10,
		messages: [
			{
				role: 'user',
				content: `Classify this message as either "update" (a request to change/add/remove code or features in the app) or "chat" (a question, comment, or conversational message that does not require changing the app). Reply with exactly one word: update or chat.\n\nMessage: "${message}"`
			}
		]
	}));
	if (onCost) onCost(calcCost(model, response.usage.input_tokens, response.usage.output_tokens));
	const text = response.content.find((b) => b.type === 'text');
	const word = text?.type === 'text' ? text.text.trim().toLowerCase() : 'update';
	return word === 'chat' ? 'chat' : 'update';
}

// ─── Conversational chat reply (Sonnet, streaming) ────────────────────────────

export async function* chatConversation(
	message: string,
	appName: string,
	requirements: string,
	onCost?: (cost: number) => void
): AsyncGenerator<string> {
	const client = getClient();

	const stream = await withStreamRetry(() => client.messages.stream({
		model: EDIT_MODEL,
		max_tokens: 1024,
		system: `You are a helpful assistant for the "${appName}" web application. You help users understand what the app does and answer questions about it. Here are the app's requirements:\n\n${requirements}\n\nBe concise and friendly. Do not output code unless specifically asked.`,
		messages: [
			{
				role: 'user',
				content: message
			}
		]
	}));

	for await (const event of stream) {
		if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
			yield event.delta.text;
		}
	}

	const finalChat = await stream.finalMessage();
	if (onCost) onCost(calcCost(EDIT_MODEL, finalChat.usage.input_tokens, finalChat.usage.output_tokens));
}

// ─── Tool-based chat with credential storage (Sonnet 4.6) ─────────────────────

const CREDENTIAL_TOOLS: Anthropic.Tool[] = [{
	name: 'store_credential',
	description: 'Store a third-party API credential in the browser localStorage. Use this when the user provides an API key or bearer token for a service.',
	input_schema: {
		type: 'object' as const,
		properties: {
			service_name: { type: 'string', description: 'Lowercase identifier for the service (e.g. "openai", "stripe", "sendgrid")' },
			credential_value: { type: 'string', description: 'The API key or bearer token value' },
			credential_type: { type: 'string', enum: ['api_key', 'bearer_token'], description: 'The type of credential' }
		},
		required: ['service_name', 'credential_value', 'credential_type']
	}
}];

export type StoredCredential = {
	service_name: string;
	credential_value: string;
	credential_type: 'api_key' | 'bearer_token';
};

export async function chatWithTools(
	message: string,
	appName: string,
	requirements: string,
	onCost?: (cost: number) => void
): Promise<{ text: string; credentials: StoredCredential[] }> {
	const client = getClient();
	const credentials: StoredCredential[] = [];
	let accumulatedText = '';

	const systemPrompt = `You are a helpful assistant for the "${appName}" web application. You help users understand what the app does and answer questions about it. Here are the app's requirements:\n\n${requirements}\n\nBe concise and friendly. Do not output code unless specifically asked.\n\nWhen a user (the app owner) provides an API key or bearer token, use the store_credential tool to save it. The credential will be stored in the browser's localStorage under the key credential_{service_name}. Generated app code reads credentials from there — the app owner provides the keys, not the end users.`;

	let messages: Anthropic.MessageParam[] = [{ role: 'user', content: message }];

	for (let round = 0; round < 4; round++) {
		const response = await withRetry(() => client.messages.create({
			model: EDIT_MODEL,
			max_tokens: 1024,
			system: systemPrompt,
			tools: CREDENTIAL_TOOLS,
			messages
		}));

		if (onCost) onCost(calcCost(EDIT_MODEL, response.usage.input_tokens, response.usage.output_tokens));

		// Collect text blocks
		for (const block of response.content) {
			if (block.type === 'text') {
				accumulatedText += block.text;
			}
		}

		// If no tool use, we're done
		if (response.stop_reason !== 'tool_use') break;

		// Process tool calls
		const toolUseBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
		const toolResults: Anthropic.ToolResultBlockParam[] = [];

		for (const toolUse of toolUseBlocks) {
			if (toolUse.name === 'store_credential') {
				const input = toolUse.input as { service_name: string; credential_value: string; credential_type: 'api_key' | 'bearer_token' };
				credentials.push({
					service_name: input.service_name,
					credential_value: input.credential_value,
					credential_type: input.credential_type
				});
				toolResults.push({
					type: 'tool_result',
					tool_use_id: toolUse.id,
					content: `Credential for "${input.service_name}" stored successfully.`
				});
			}
		}

		// Continue conversation with tool results
		messages = [
			...messages,
			{ role: 'assistant', content: response.content },
			{ role: 'user', content: toolResults }
		];
	}

	return { text: accumulatedText, credentials };
}

// ─── Summarise a user edit request (Haiku 4.5, fast) ─────────────────────────

export async function summariseRequest(
	editRequest: string,
	onCost?: (cost: number) => void
): Promise<string> {
	const client = getClient();
	const model = 'claude-haiku-4-5-20251001';
	const response = await withRetry(() => client.messages.create({
		model,
		max_tokens: 100,
		messages: [
			{
				role: 'user',
				content: `Summarise this app edit request in one short sentence (max 15 words), focusing on the UX/UI change requested:\n\n"${editRequest}"`
			}
		]
	}));
	if (onCost) onCost(calcCost(model, response.usage.input_tokens, response.usage.output_tokens));
	const block = response.content.find((b) => b.type === 'text');
	return block?.type === 'text' ? block.text.trim() : editRequest.slice(0, 100);
}

// ─── Inject custom scripts into generated HTML ────────────────────────────────

export function injectScripts(html: string, scripts: ScriptFile[]): string {
	if (!scripts.length) return html;

	const tags = scripts
		.map((s) => `<script>/* ${s.name} */\n${s.content}\n</script>`)
		.join('\n');

	// Insert before the first <script type="module"> so custom globals are available
	const moduleIdx = html.indexOf('<script type="module">');
	if (moduleIdx !== -1) {
		return html.slice(0, moduleIdx) + tags + '\n' + html.slice(moduleIdx);
	}

	// Fallback: insert before </body> or </html>
	const bodyClose = html.lastIndexOf('</body>');
	if (bodyClose !== -1) {
		return html.slice(0, bodyClose) + tags + '\n' + html.slice(bodyClose);
	}

	// Last resort: append
	return html + '\n' + tags;
}
