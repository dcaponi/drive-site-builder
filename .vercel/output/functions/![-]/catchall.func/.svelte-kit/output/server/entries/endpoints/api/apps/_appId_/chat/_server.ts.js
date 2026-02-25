import { g as getAuthedClient } from "../../../../../../chunks/auth.js";
import { g as getAppById, a as getAppSchema, b as getConversationSummaries, c as appendConversation } from "../../../../../../chunks/sheets.js";
import { r as readRequirementsDoc, a as readGeneratedCode, w as writeGeneratedCode } from "../../../../../../chunks/drive.js";
import { a as summariseRequest, e as editApp } from "../../../../../../chunks/anthropic.js";
import { json, error } from "@sveltejs/kit";
const POST = async ({ params, request, locals, url }) => {
  const user = locals.user;
  const appId = params.appId;
  const auth = getAuthedClient(user, url.origin);
  const body = await request.json().catch(() => ({}));
  const editRequest = String(body.message ?? "").trim();
  if (!editRequest) return json({ error: "Message is required" }, { status: 400 });
  const app = await getAppById(auth, appId);
  if (!app) throw error(404, "App not found");
  if (!app.generated_code_doc_id) {
    return json({ error: "App has not been built yet." }, { status: 400 });
  }
  const [requirements, schema, currentCode, uxSummaries] = await Promise.all([
    readRequirementsDoc(auth, app.requirements_doc_id),
    getAppSchema(auth, app.database_sheet_id),
    readGeneratedCode(auth, app.generated_code_doc_id),
    getConversationSummaries(auth, appId).catch(() => [])
  ]);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  appendConversation(auth, {
    app_id: appId,
    role: "user",
    message: editRequest,
    summary: "",
    created_at: now
  }).catch(() => {
  });
  const summaryPromise = summariseRequest(editRequest);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      let fullCode = "";
      try {
        const generator = editApp(
          currentCode,
          editRequest,
          requirements,
          schema,
          url.origin,
          appId,
          uxSummaries
        );
        for await (const chunk of generator) {
          fullCode += chunk;
          controller.enqueue(enc.encode(chunk));
        }
        const [summary] = await Promise.all([
          summaryPromise,
          writeGeneratedCode(auth, appId, app.name, fullCode, app.folder_id, app.generated_code_doc_id || void 0)
        ]);
        await appendConversation(auth, {
          app_id: appId,
          role: "assistant",
          message: `Edit applied: ${editRequest}`,
          summary,
          created_at: (/* @__PURE__ */ new Date()).toISOString()
        });
        controller.close();
      } catch (err) {
        controller.error(err instanceof Error ? err.message : "Edit failed");
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
};
export {
  POST
};
