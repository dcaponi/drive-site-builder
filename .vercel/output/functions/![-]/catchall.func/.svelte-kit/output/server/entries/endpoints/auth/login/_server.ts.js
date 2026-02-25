import { a as getAuthUrl } from "../../../../chunks/auth.js";
const GET = ({ url }) => {
  const origin = url.origin;
  return new Response(null, {
    status: 302,
    headers: { Location: getAuthUrl(origin) }
  });
};
export {
  GET
};
