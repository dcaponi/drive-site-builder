import { g as getAuthedClient } from "../../../../../../chunks/auth.js";
import { g as getAppById, a as getAppSchema, b as getConversationSummaries } from "../../../../../../chunks/sheets.js";
import { r as readRequirementsDoc, a as readGeneratedCode, w as writeGeneratedCode } from "../../../../../../chunks/drive.js";
import { i as isTruncated, s as stripTruncationMarker, c as continueApp, g as generateApp } from "../../../../../../chunks/anthropic.js";
import { error } from "@sveltejs/kit";
const POST = async ({ params, locals, url }) => {
  const user = locals.user;
  const appId = params.appId;
  const auth = getAuthedClient(user, url.origin);
  const app = await getAppById(auth, appId);
  if (!app) throw error(404, "App not found");
  const [requirements, schema, uxSummaries, existingCode] = await Promise.all([
    readRequirementsDoc(auth, app.requirements_doc_id),
    getAppSchema(auth, app.database_sheet_id),
    getConversationSummaries(auth, appId),
    app.generated_code_doc_id ? readGeneratedCode(auth, app.generated_code_doc_id) : Promise.resolve("")
  ]);
  const shouldContinue = isTruncated(existingCode);
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      try {
        if (shouldContinue) {
          const partialCode = stripTruncationMarker(existingCode);
          let continuation = "";
          controller.enqueue(enc.encode("<!-- Continuing from previous output… -->\n"));
          const generator = continueApp(partialCode, requirements, schema, url.origin, appId, uxSummaries);
          for await (const chunk of generator) {
            continuation += chunk;
            controller.enqueue(enc.encode(chunk));
          }
          await writeGeneratedCode(
            auth,
            appId,
            app.name,
            partialCode + "\n" + continuation,
            app.folder_id,
            app.generated_code_doc_id || void 0
          );
        } else {
          let fullCode = "";
          const generator = generateApp(requirements, schema, url.origin, appId, uxSummaries);
          for await (const chunk of generator) {
            fullCode += chunk;
            controller.enqueue(enc.encode(chunk));
          }
          await writeGeneratedCode(
            auth,
            appId,
            app.name,
            fullCode,
            app.folder_id,
            app.generated_code_doc_id || void 0
          );
        }
        controller.close();
      } catch (err) {
        controller.error(err instanceof Error ? err.message : "Build failed");
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
