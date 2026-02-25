import { g as getAuthedClient } from "../../../../../../chunks/auth.js";
import { g as getAppById, u as updateAppInConfig } from "../../../../../../chunks/sheets.js";
import { error, json } from "@sveltejs/kit";
const PUT = async ({ params, locals, request, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  const app = await getAppById(auth, params.appId);
  if (!app) throw error(404, "App not found");
  const body = await request.json();
  const { username, password } = body;
  if (!username || !password) {
    throw error(400, "username and password are required");
  }
  await updateAppInConfig(auth, app.id, {
    app_username: username.trim(),
    app_password: password
  });
  return json({ ok: true });
};
const DELETE = async ({ params, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  const app = await getAppById(auth, params.appId);
  if (!app) throw error(404, "App not found");
  await updateAppInConfig(auth, app.id, {
    app_username: "",
    app_password: ""
  });
  return json({ ok: true });
};
export {
  DELETE,
  PUT
};
