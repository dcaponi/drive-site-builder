import { g as getAuthedClient } from "../../../chunks/auth.js";
import { f as getConfigSheet } from "../../../chunks/sheets.js";
import { b as registerApp, v as verifyRootFolder, l as listAppFolders } from "../../../chunks/drive.js";
import { fail } from "@sveltejs/kit";
const load = async ({ locals, url }) => {
  const user = locals.user;
  const auth = getAuthedClient(user, url.origin);
  let apps = [];
  let folders = [];
  let driveError = null;
  let rootFolderName = null;
  try {
    const root = await verifyRootFolder(auth);
    rootFolderName = root.name;
    [apps, folders] = await Promise.all([
      getConfigSheet(auth),
      listAppFolders(auth)
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    driveError = msg.includes("insufficientPermissions") || msg.includes("Request had insufficient") ? "Missing Drive permissions — sign out and sign back in to re-authorize with Drive access." : msg.includes("invalid_grant") || msg.includes("Token has been expired") ? "Session expired — sign out and sign back in." : msg;
  }
  return { apps, folders, driveError, rootFolderName };
};
const actions = {
  register: async ({ request, locals, url }) => {
    const user = locals.user;
    const auth = getAuthedClient(user, url.origin);
    const data = await request.formData();
    const folderId = String(data.get("folder_id") ?? "").trim();
    const folderName = String(data.get("folder_name") ?? "").trim();
    if (!folderId) return fail(400, { error: "Folder ID is required" });
    try {
      const app = await registerApp(auth, folderId, folderName || folderId);
      return { success: true, appId: app.id };
    } catch (err) {
      return fail(400, { error: err instanceof Error ? err.message : "Registration failed" });
    }
  }
};
export {
  actions,
  load
};
