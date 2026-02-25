import { b as clearSessionCookie } from "../../../../chunks/auth.js";
const GET = () => {
  return new Response(null, {
    status: 302,
    headers: {
      "Set-Cookie": clearSessionCookie(),
      Location: "/"
    }
  });
};
export {
  GET
};
