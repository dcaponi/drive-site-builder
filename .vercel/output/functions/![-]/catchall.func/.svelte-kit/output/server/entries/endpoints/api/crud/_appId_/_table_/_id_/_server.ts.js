import { g as getAuthedClient } from "../../../../../../../chunks/auth.js";
import { d as deleteRecord, g as getRecord, u as updateRecord } from "../../../../../../../chunks/crud.js";
import { json } from "@sveltejs/kit";
const GET = async ({ params, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  try {
    const data = await getRecord(auth, params.appId, params.table, params.id);
    if (!data) return json({ error: "Not found" }, { status: 404 });
    return json({ data });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
};
const PUT = async ({ params, request, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  const body = await request.json().catch(() => ({}));
  try {
    const data = await updateRecord(auth, params.appId, params.table, params.id, body);
    if (!data) return json({ error: "Not found" }, { status: 404 });
    return json({ data });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
};
const DELETE = async ({ params, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  try {
    const success = await deleteRecord(auth, params.appId, params.table, params.id);
    if (!success) return json({ error: "Not found" }, { status: 404 });
    return json({ success: true });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
};
const OPTIONS = () => new Response(null, {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }
});
export {
  DELETE,
  GET,
  OPTIONS,
  PUT
};
