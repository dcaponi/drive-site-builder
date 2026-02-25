import { d as getTokenFromCookies, v as verifySessionToken } from "../chunks/auth.js";
const handle = async ({ event, resolve }) => {
  const token = getTokenFromCookies(event.request.headers.get("cookie"));
  if (token) {
    const user = await verifySessionToken(token);
    event.locals.user = user;
  } else {
    event.locals.user = null;
  }
  const path = event.url.pathname;
  const isProtected = path.startsWith("/dashboard") || path.startsWith("/app/") || path.startsWith("/api/apps");
  if (isProtected && !event.locals.user) {
    if (path.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }
  return resolve(event);
};
export {
  handle
};
