import { g as getAuthedClient } from "../../../../../../../chunks/auth.js";
import { d as deleteConversationEntry } from "../../../../../../../chunks/sheets.js";
import { json } from "@sveltejs/kit";
const DELETE = async ({ params, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  const ok = await deleteConversationEntry(auth, params.feedbackId);
  return json({ ok });
};
export {
  DELETE
};
