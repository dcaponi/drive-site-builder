import { g as getAuthedClient } from "../../../../../../chunks/auth.js";
import { l as listRecords, c as createRecord } from "../../../../../../chunks/crud.js";
import { json } from "@sveltejs/kit";
const GET = async ({ params, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  try {
    const data = await listRecords(auth, params.appId, params.table);
    return json({ data });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
};
const POST = async ({ params, request, locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  const body = await request.json().catch(() => ({}));
  try {
    const data = await createRecord(auth, params.appId, params.table, body);
    return json({ data }, { status: 201 });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
};
const OPTIONS = () => new Response(null, {
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }
});
export {
  GET,
  OPTIONS,
  POST
};
