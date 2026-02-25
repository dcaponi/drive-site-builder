import { e as exchangeCode, c as createSessionToken, m as makeSessionCookie } from "../../../../chunks/auth.js";
const GET = async ({ url }) => {
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error || !code) {
    const msg = encodeURIComponent(error ?? "Google sign-in was cancelled");
    return new Response(null, { status: 302, headers: { Location: `/?error=${msg}` } });
  }
  try {
    const user = await exchangeCode(code, url.origin);
    const token = await createSessionToken(user);
    const cookie = makeSessionCookie(token);
    return new Response(null, {
      status: 302,
      headers: {
        "Set-Cookie": cookie,
        Location: "/dashboard"
      }
    });
  } catch (err) {
    const msg = encodeURIComponent(err instanceof Error ? err.message : "Authentication failed");
    return new Response(null, { status: 302, headers: { Location: `/?error=${msg}` } });
  }
};
export {
  GET
};
