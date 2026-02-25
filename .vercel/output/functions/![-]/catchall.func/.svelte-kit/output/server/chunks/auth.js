import { SignJWT, jwtVerify } from "jose";
import { b as private_env } from "./shared-server.js";
import { google } from "googleapis";
const COOKIE_NAME = "session";
const COOKIE_MAX_AGE = 30 * 24 * 3600;
function getSecret() {
  const secret = private_env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}
function getOAuthClient(origin) {
  return new google.auth.OAuth2(
    private_env.GOOGLE_CLIENT_ID,
    private_env.GOOGLE_CLIENT_SECRET,
    `${origin}/auth/callback`
  );
}
function getAuthUrl(origin) {
  const client = getOAuthClient(origin);
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    // always get refresh_token
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents"
    ]
  });
}
async function exchangeCode(code, origin) {
  const client = getOAuthClient(origin);
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) throw new Error("No access token returned from Google");
  client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: client });
  const { data: profile } = await oauth2.userinfo.get();
  const allowedEmail = private_env.ALLOWED_EMAIL;
  if (allowedEmail && profile.email !== allowedEmail) {
    throw new Error(`Access restricted. Only ${allowedEmail} is allowed.`);
  }
  return {
    email: profile.email,
    name: profile.name ?? profile.email,
    picture: profile.picture ?? "",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? "",
    expiry_date: tokens.expiry_date ?? Date.now() + 3600 * 1e3
  };
}
async function createSessionToken(user) {
  return new SignJWT({ ...user }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(getSecret());
}
async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload;
  } catch {
    return null;
  }
}
function getTokenFromCookies(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.split(";").map((c) => c.trim().split("=")).find(([k]) => k === COOKIE_NAME);
  return match ? match.slice(1).join("=") : null;
}
function makeSessionCookie(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}
function clearSessionCookie() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}
function getAuthedClient(user, origin) {
  const client = getOAuthClient(origin);
  client.setCredentials({
    access_token: user.access_token,
    refresh_token: user.refresh_token,
    expiry_date: user.expiry_date
  });
  return client;
}
export {
  getAuthUrl as a,
  clearSessionCookie as b,
  createSessionToken as c,
  getTokenFromCookies as d,
  exchangeCode as e,
  getAuthedClient as g,
  makeSessionCookie as m,
  verifySessionToken as v
};
