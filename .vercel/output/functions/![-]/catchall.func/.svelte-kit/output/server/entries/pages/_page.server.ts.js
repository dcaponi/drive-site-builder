import { redirect } from "@sveltejs/kit";
const load = async ({ locals, url }) => {
  if (locals.user) throw redirect(302, "/dashboard");
  return { error: url.searchParams.get("error") };
};
export {
  load
};
