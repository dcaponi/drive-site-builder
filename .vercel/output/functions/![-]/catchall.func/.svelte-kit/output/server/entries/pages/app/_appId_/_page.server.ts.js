import { error } from "@sveltejs/kit";
import { g as getAuthedClient } from "../../../../chunks/auth.js";
import { g as getAppById, a as getAppSchema, e as getAppFeedbacks } from "../../../../chunks/sheets.js";
import { r as readRequirementsDoc } from "../../../../chunks/drive.js";
const load = async ({ locals, params, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  const app = await getAppById(auth, params.appId);
  if (!app) throw error(404, "App not found");
  const [requirements, schema, feedbacks] = await Promise.all([
    readRequirementsDoc(auth, app.requirements_doc_id).catch(() => ""),
    getAppSchema(auth, app.database_sheet_id).catch(() => []),
    getAppFeedbacks(auth, params.appId).catch(() => [])
  ]);
  return { app, requirements, schema, feedbacks };
};
export {
  load
};
