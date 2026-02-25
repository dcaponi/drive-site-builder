import { g as getAuthedClient } from "../../../../chunks/auth.js";
import { g as getAppById } from "../../../../chunks/sheets.js";
import { s as signAppToken, a as appCookieName, v as verifyAppToken } from "../../../../chunks/appAuth.js";
import { fail, redirect, error } from "@sveltejs/kit";
const load = async ({ params, locals, url, cookies }) => {
  const user = locals.user;
  if (!user) throw error(401, "Not authenticated");
  const auth = getAuthedClient(user, url.origin);
  const app = await getAppById(auth, params.appId);
  if (!app) throw error(404, "App not found");
  const hasCredentials = !!(app.app_username && app.app_password);
  if (!hasCredentials) {
    return { app, authed: true };
  }
  const tokenParam = url.searchParams.get("token");
  if (tokenParam) {
    const valid = await verifyAppToken(tokenParam, app.id, app.app_password);
    if (valid) {
      cookies.set(appCookieName(app.id), tokenParam, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 90 * 24 * 3600
      });
      throw redirect(302, `/serve/${app.id}`);
    }
  }
  const cookieToken = cookies.get(appCookieName(app.id));
  if (cookieToken) {
    const valid = await verifyAppToken(cookieToken, app.id, app.app_password);
    if (valid) {
      return { app, authed: true };
    }
  }
  return { app, authed: false };
};
const actions = {
  login: async ({ params, locals, request, url, cookies }) => {
    const user = locals.user;
    if (!user) return fail(401, { error: "Not authenticated" });
    const auth = getAuthedClient(user, url.origin);
    const app = await getAppById(auth, params.appId);
    if (!app) return fail(404, { error: "App not found" });
    const data = await request.formData();
    const username = String(data.get("username") ?? "");
    const password = String(data.get("password") ?? "");
    if (username !== app.app_username || password !== app.app_password) {
      return fail(401, { error: "Invalid username or password" });
    }
    const token = await signAppToken(app.id, app.app_password);
    cookies.set(appCookieName(app.id), token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 90 * 24 * 3600
    });
    throw redirect(302, `/serve/${app.id}`);
  }
};
export {
  actions,
  load
};
