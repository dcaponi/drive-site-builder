import { g as getAuthedClient } from "../../../../../../chunks/auth.js";
import { g as getAppById } from "../../../../../../chunks/sheets.js";
import { s as signAppToken } from "../../../../../../chunks/appAuth.js";
import { error, json } from "@sveltejs/kit";
const POST = async ({ params, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  const app = await getAppById(auth, params.appId);
  if (!app) throw error(404, "App not found");
  if (!app.app_password) {
    throw error(400, "No password set on this app");
  }
  const token = await signAppToken(app.id, app.app_password);
  const magicLink = `${url.origin}/serve/${app.id}?token=${token}`;
  return json({ token, magicLink });
};
export {
  POST
};
