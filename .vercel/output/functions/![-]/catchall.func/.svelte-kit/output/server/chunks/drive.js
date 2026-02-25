import { a as getDrive } from "./google.js";
import { u as updateAppInConfig, h as addAppToConfig } from "./sheets.js";
import { v4 } from "uuid";
import { b as private_env } from "./shared-server.js";
import { minify } from "html-minifier-terser";
async function minifyHtml(code) {
  try {
    return await minify(code, {
      collapseWhitespace: true,
      removeComments: true,
      minifyCSS: true,
      minifyJS: true,
      removeAttributeQuotes: true,
      removeRedundantAttributes: true,
      useShortDoctype: true
    });
  } catch {
    return code;
  }
}
const DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true
};
function getRootFolderId() {
  const id = (private_env.DRIVE_ROOT_FOLDER_ID ?? "").trim();
  if (!id) throw new Error("DRIVE_ROOT_FOLDER_ID env var is not set");
  return id;
}
async function verifyRootFolder(auth) {
  const rootFolderId = getRootFolderId();
  const drive = getDrive(auth);
  try {
    const res = await drive.files.get({
      fileId: rootFolderId,
      fields: "id,name,mimeType",
      ...DRIVE_PARAMS
    });
    return { id: res.data.id, name: res.data.name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Cannot access Drive folder "${rootFolderId}": ${msg}. Check that DRIVE_ROOT_FOLDER_ID is the folder ID (not the full URL) and your account has access.`
    );
  }
}
async function listAppFolders(auth) {
  const rootFolderId = getRootFolderId();
  const drive = getDrive(auth);
  const res = await drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    orderBy: "name",
    ...DRIVE_PARAMS
  });
  return (res.data.files ?? []).map((f) => ({ id: f.id, name: f.name }));
}
async function scanAppFolder(auth, folderId) {
  const drive = getDrive(auth);
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType)",
    orderBy: "name",
    ...DRIVE_PARAMS
  });
  const files = res.data.files ?? [];
  const docs = files.filter((f) => f.mimeType === "application/vnd.google-apps.document");
  const sheets = files.filter((f) => f.mimeType === "application/vnd.google-apps.spreadsheet");
  const reqDoc = docs.find((f) => /requirements?/i.test(f.name ?? "")) ?? docs[0] ?? null;
  const dbSheet = sheets.find((f) => /database|db/i.test(f.name ?? "")) ?? sheets[0] ?? null;
  return {
    requirementsDocId: reqDoc?.id ?? null,
    databaseSheetId: dbSheet?.id ?? null
  };
}
async function registerApp(auth, folderId, folderName) {
  const { requirementsDocId, databaseSheetId } = await scanAppFolder(auth, folderId);
  if (!requirementsDocId) throw new Error("No Google Doc found in folder (requirements doc)");
  if (!databaseSheetId) throw new Error("No Google Sheet found in folder (database)");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const app = {
    id: v4(),
    name: folderName,
    folder_id: folderId,
    requirements_doc_id: requirementsDocId,
    database_sheet_id: databaseSheetId,
    generated_code_doc_id: "",
    created_at: now,
    updated_at: now,
    last_built_at: "",
    app_username: "",
    app_password: ""
  };
  await addAppToConfig(auth, app);
  return app;
}
async function readRequirementsDoc(auth, docId) {
  const drive = getDrive(auth);
  const res = await drive.files.export(
    { fileId: docId, mimeType: "text/plain" },
    { responseType: "text" }
  );
  return res.data ?? "";
}
async function writeGeneratedCode(auth, appId, appName, code, folderId, existingDocId) {
  const drive = getDrive(auth);
  const minified = await minifyHtml(code);
  if (existingDocId) {
    try {
      await drive.files.delete({ fileId: existingDocId, ...DRIVE_PARAMS });
    } catch {
    }
  }
  const created = await drive.files.create({
    requestBody: {
      name: `${appName} — Generated`,
      mimeType: "application/vnd.google-apps.document",
      parents: [folderId]
    },
    media: {
      mimeType: "text/plain",
      body: minified
    },
    fields: "id",
    ...DRIVE_PARAMS
  });
  const docId = created.data.id;
  await updateAppInConfig(auth, appId, {
    generated_code_doc_id: docId,
    last_built_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  });
  return docId;
}
async function readGeneratedCode(auth, docId) {
  const drive = getDrive(auth);
  const res = await drive.files.export(
    { fileId: docId, mimeType: "text/plain" },
    { responseType: "text" }
  );
  return (res.data ?? "").trim();
}
export {
  readGeneratedCode as a,
  registerApp as b,
  listAppFolders as l,
  readRequirementsDoc as r,
  verifyRootFolder as v,
  writeGeneratedCode as w
};
