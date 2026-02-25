const load = async ({ locals }) => {
  return {
    user: locals.user ? { email: locals.user.email, name: locals.user.name, picture: locals.user.picture } : null
  };
};
export {
  load
};
