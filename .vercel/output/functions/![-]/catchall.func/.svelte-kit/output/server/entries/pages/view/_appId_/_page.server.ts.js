import { redirect } from "@sveltejs/kit";
const load = async ({ params }) => {
  throw redirect(301, `/serve/${params.appId}`);
};
export {
  load
};
