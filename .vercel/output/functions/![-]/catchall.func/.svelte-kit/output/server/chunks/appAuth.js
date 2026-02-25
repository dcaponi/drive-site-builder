import { SignJWT, jwtVerify } from "jose";
import { b as private_env } from "./shared-server.js";
const TOKEN_MAX_AGE = 90 * 24 * 3600;
function getAppSecret(appPassword) {
  const base = private_env.JWT_SECRET;
  if (!base) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(`${base}:${appPassword}`);
}
function appCookieName(appId) {
  return `app_${appId.replace(/[^a-zA-Z0-9]/g, "_")}`;
}
async function signAppToken(appId, appPassword) {
  return new SignJWT({ appId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${TOKEN_MAX_AGE}s`).sign(getAppSecret(appPassword));
}
async function verifyAppToken(token, appId, appPassword) {
  try {
    const { payload } = await jwtVerify(token, getAppSecret(appPassword));
    return payload.appId === appId;
  } catch {
    return false;
  }
}
export {
  appCookieName as a,
  signAppToken as s,
  verifyAppToken as v
};
