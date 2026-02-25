import Anthropic from "@anthropic-ai/sdk";
import { b as private_env } from "./shared-server.js";
let _client = null;
function getClient() {
  if (!_client) _client = new Anthropic({ apiKey: private_env.ANTHROPIC_API_KEY });
  return _client;
}
const INITIAL_MODEL = "claude-opus-4-6";
const EDIT_MODEL = "claude-sonnet-4-6";
function schemaToDescription(tables) {
  return tables.map((t) => {
    const cols = t.columns.map((c) => `  - ${c.name} (${c.type})`).join("\n");
    return `Table: ${t.name}
${cols}`;
  }).join("\n\n");
}
function uxLessonsBlock(summaries) {
  if (!summaries.length) return "";
  const lessons = summaries.slice(-20).map((s, i) => `${i + 1}. ${s}`).join("\n");
  return `
UX lessons learned from past user feedback (apply these when generating the UI):
${lessons}
`;
}
function buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries) {
  return `You are an expert full-stack web developer. Your job is to generate a complete, single-file HTML web application.

REQUIREMENTS:
${requirements}

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
${uxLessonsBlock(uxSummaries)}
RULES:
- Output ONLY valid HTML. No markdown, no explanation, no code fences.
- Embed all CSS in a <style> tag and all JS in a <script type="module"> tag.
- Use the CRUD API endpoints above with fetch(). Handle loading and error states.
- Make the UI polished, responsive, and modern (use CSS custom properties, clean typography).
- Use semantic HTML. Prefer a card-based layout for lists. Forms should be inline where sensible.
- Auto-refresh data after mutations. Show user-friendly success/error toasts.
- The app must work without any build step or external dependencies beyond what a CDN provides.
- If the requirements mention charts or rich UI, use a CDN library (e.g. Chart.js from jsDelivr).`;
}
async function* generateApp(requirements, tables, apiBase, appId, uxSummaries) {
  const client = getClient();
  const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries);
  const stream = client.messages.stream({
    model: INITIAL_MODEL,
    max_tokens: 16e3,
    // @ts-expect-error - thinking is valid for Opus 4.6
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: "Generate the complete HTML application now. Output only the HTML."
      }
    ]
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "max_tokens") {
    yield "\n<!-- [TRUNCATED: output hit max_tokens limit — try rebuilding] -->";
  }
}
const TRUNCATION_MARKER = "<!-- [TRUNCATED:";
function isTruncated(code) {
  return code.includes(TRUNCATION_MARKER);
}
function stripTruncationMarker(code) {
  const idx = code.indexOf(TRUNCATION_MARKER);
  return idx === -1 ? code : code.slice(0, idx).trimEnd();
}
async function* continueApp(partialCode, requirements, tables, apiBase, appId, uxSummaries) {
  const client = getClient();
  const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries);
  const clean = stripTruncationMarker(partialCode);
  const stream = client.messages.stream({
    model: INITIAL_MODEL,
    max_tokens: 16e3,
    // @ts-expect-error - thinking is valid for Opus 4.6
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: `You previously started generating an HTML application but were cut off by the token limit. Here is the partial HTML output so far:

${clean}

Continue generating from exactly where you left off. Output ONLY the continuation — do not repeat anything already written. Output only valid HTML.`
      }
    ]
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "max_tokens") {
    yield "\n<!-- [TRUNCATED: output hit max_tokens limit — try rebuilding] -->";
  }
}
async function* editApp(currentCode, editRequest, requirements, tables, apiBase, appId, uxSummaries) {
  const client = getClient();
  const system = buildSystemPrompt(requirements, tables, apiBase, appId, uxSummaries);
  const stream = client.messages.stream({
    model: EDIT_MODEL,
    max_tokens: 64e3,
    system,
    messages: [
      {
        role: "user",
        content: `Here is the current generated application:

${currentCode}

Edit request: ${editRequest}

Output the complete updated HTML file. Output only the HTML, no explanation.`
      }
    ]
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
  const final = await stream.finalMessage();
  if (final.stop_reason === "max_tokens") {
    yield "\n<!-- [TRUNCATED: output hit max_tokens limit — try editing again] -->";
  }
}
async function summariseRequest(editRequest) {
  const client = getClient();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content: `Summarise this app edit request in one short sentence (max 15 words), focusing on the UX/UI change requested:

"${editRequest}"`
      }
    ]
  });
  const block = response.content.find((b) => b.type === "text");
  return block?.type === "text" ? block.text.trim() : editRequest.slice(0, 100);
}
export {
  summariseRequest as a,
  continueApp as c,
  editApp as e,
  generateApp as g,
  isTruncated as i,
  stripTruncationMarker as s
};
