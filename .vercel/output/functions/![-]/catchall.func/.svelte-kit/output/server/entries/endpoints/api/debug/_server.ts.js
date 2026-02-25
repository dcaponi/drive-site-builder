import { g as getAuthedClient } from "../../../../chunks/auth.js";
import { a as getDrive } from "../../../../chunks/google.js";
import { json } from "@sveltejs/kit";
const GET = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) return json({ error: "Not signed in" }, { status: 401 });
  const folderId = (process.env.DRIVE_ROOT_FOLDER_ID ?? "").trim();
  const result = {
    env: {
      DRIVE_ROOT_FOLDER_ID_raw: process.env.DRIVE_ROOT_FOLDER_ID,
      DRIVE_ROOT_FOLDER_ID_trimmed: folderId,
      DRIVE_ROOT_FOLDER_ID_length: folderId.length,
      GOOGLE_CLIENT_ID_set: !!process.env.GOOGLE_CLIENT_ID
    },
    session: {
      email: user.email,
      access_token_prefix: user.access_token?.slice(0, 20) + "…",
      has_refresh_token: !!user.refresh_token,
      expiry_date: new Date(user.expiry_date).toISOString(),
      token_expired: Date.now() > user.expiry_date
    }
  };
  try {
    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${user.access_token}`
    );
    const tokenInfo = await tokenInfoRes.json();
    result.token_info = tokenInfo;
  } catch (e) {
    result.token_info_error = String(e);
  }
  const auth = getAuthedClient(user, url.origin);
  const drive = getDrive(auth);
  try {
    const rootRes = await drive.files.list({
      pageSize: 5,
      fields: "files(id,name,mimeType)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true
    });
    result.drive_root_sample = rootRes.data.files;
  } catch (e) {
    result.drive_root_error = e instanceof Error ? e.message : String(e);
  }
  if (folderId) {
    try {
      const folderRes = await drive.files.get({
        fileId: folderId,
        fields: "id,name,mimeType,owners",
        supportsAllDrives: true
      });
      result.folder_get = folderRes.data;
    } catch (e) {
      result.folder_get_error = e instanceof Error ? e.message : String(e);
    }
  } else {
    result.folder_get_error = "DRIVE_ROOT_FOLDER_ID is empty after trim";
  }
  return json(result, { headers: { "Content-Type": "application/json" } });
};
export {
  GET
};
