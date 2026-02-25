import { g as getAuthedClient } from "../../../../../chunks/auth.js";
import { g as getAppById } from "../../../../../chunks/sheets.js";
import { a as readGeneratedCode } from "../../../../../chunks/drive.js";
import { error } from "@sveltejs/kit";
const GET = async ({ params, locals, url }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");
  const auth = getAuthedClient(user, url.origin);
  const app = await getAppById(auth, params.appId);
  if (!app) throw error(404, "App not found");
  if (!app.generated_code_doc_id) {
    return new Response(
      `<!doctype html><html><body style="font-family:sans-serif;padding:2rem;color:#6b7280"><h2>Not built yet</h2><p>Go back and click "Build App".</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
  const code = await readGeneratedCode(auth, app.generated_code_doc_id);
  return new Response(code, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "SAMEORIGIN"
    }
  });
};
export {
  GET
};
