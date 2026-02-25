import { g as getSheets } from "./google.js";
import { v4 } from "uuid";
import { b as private_env } from "./shared-server.js";
function rootFolderId() {
  const id = (private_env.DRIVE_ROOT_FOLDER_ID ?? "").trim();
  if (!id) throw new Error("DRIVE_ROOT_FOLDER_ID env var is not set");
  return id;
}
const DRIVE_PARAMS = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true
};
const CONFIG_SHEET_NAME = "_config";
const CONVERSATIONS_SHEET_NAME = "_conversations";
let _configSheetId = null;
let _conversationsSheetId = null;
async function findOrCreateSheet(auth, name, cachedId) {
  if (cachedId) return cachedId;
  const { google } = await import("googleapis");
  const drive = google.drive({ version: "v3", auth });
  const res = await drive.files.list({
    q: `name = '${name}' and '${rootFolderId()}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
    ...DRIVE_PARAMS
  });
  if (res.data.files?.length) {
    return res.data.files[0].id;
  }
  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [rootFolderId()]
    },
    fields: "id",
    ...DRIVE_PARAMS
  });
  return created.data.id;
}
async function getConfigSheetId(auth) {
  _configSheetId = await findOrCreateSheet(auth, CONFIG_SHEET_NAME, _configSheetId);
  return _configSheetId;
}
async function getConversationsSheetId(auth) {
  _conversationsSheetId = await findOrCreateSheet(
    auth,
    CONVERSATIONS_SHEET_NAME,
    _conversationsSheetId
  );
  return _conversationsSheetId;
}
async function ensureSheetTab(auth, spreadsheetId, tabName) {
  const sheets = getSheets(auth);
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets ?? [];
  if (existing.some((s) => s.properties?.title === tabName)) return;
  const sheet1 = existing.find((s) => s.properties?.title === "Sheet1");
  if (sheet1?.properties?.sheetId !== void 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: sheet1.properties.sheetId, title: tabName },
              fields: "title"
            }
          }
        ]
      }
    });
  } else {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] }
    });
  }
}
const APP_HEADERS = [
  "id",
  "name",
  "folder_id",
  "requirements_doc_id",
  "database_sheet_id",
  "generated_code_doc_id",
  "created_at",
  "updated_at",
  "last_built_at",
  "app_username",
  "app_password"
];
async function getConfigSheet(auth) {
  const sheetId = await getConfigSheetId(auth);
  await ensureSheetTab(auth, sheetId, "apps");
  const sheets = getSheets(auth);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "apps!A:K"
  });
  const rows = res.data.values ?? [];
  if (rows.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "apps!A1",
      valueInputOption: "RAW",
      requestBody: { values: [[...APP_HEADERS]] }
    });
    return [];
  }
  return rows.slice(1).filter((r) => r[0]).map((r) => ({
    id: r[0] ?? "",
    name: r[1] ?? "",
    folder_id: r[2] ?? "",
    requirements_doc_id: r[3] ?? "",
    database_sheet_id: r[4] ?? "",
    generated_code_doc_id: r[5] ?? "",
    created_at: r[6] ?? "",
    updated_at: r[7] ?? "",
    last_built_at: r[8] ?? "",
    app_username: r[9] ?? "",
    app_password: r[10] ?? ""
  }));
}
async function getAppById(auth, appId) {
  const apps = await getConfigSheet(auth);
  return apps.find((a) => a.id === appId) ?? null;
}
async function addAppToConfig(auth, app) {
  const sheetId = await getConfigSheetId(auth);
  const sheets = getSheets(auth);
  const row = APP_HEADERS.map((h) => app[h] ?? "");
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "apps!A:A",
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  });
}
async function updateAppInConfig(auth, appId, updates) {
  const sheetId = await getConfigSheetId(auth);
  const sheets = getSheets(auth);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "apps!A:A"
  });
  const rows = res.data.values ?? [];
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === appId);
  if (rowIndex === -1) return;
  const sheetRow = rowIndex + 1;
  const fullRes = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `apps!A${sheetRow}:K${sheetRow}`
  });
  const current = fullRes.data.values?.[0] ?? [];
  const updated = APP_HEADERS.map((h, i) => {
    const key = h;
    return key in updates ? updates[key] ?? "" : current[i] ?? "";
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `apps!A${sheetRow}:K${sheetRow}`,
    valueInputOption: "RAW",
    requestBody: { values: [updated] }
  });
}
async function getAppSchema(auth, sheetId) {
  const sheets = getSheets(auth);
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
  const sheetList = (meta.data.sheets ?? []).map((s) => s.properties?.title ?? "");
  const tables = [];
  for (const tableName of sheetList) {
    if (tableName.startsWith("_")) continue;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tableName}!1:2`
      // header + first data row for type inference
    });
    const rows = res.data.values ?? [];
    const headers = rows[0] ?? [];
    const sampleRow = rows[1] ?? [];
    const columns = headers.map((h, i) => ({
      name: String(h),
      type: inferType(sampleRow[i])
    }));
    tables.push({ name: tableName, columns });
  }
  return tables;
}
function inferType(value) {
  if (value === void 0 || value === null || value === "") return "string";
  const v = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return "date";
  if (!isNaN(Number(v))) return "number";
  if (v.toLowerCase() === "true" || v.toLowerCase() === "false") return "boolean";
  return "string";
}
const CONV_HEADERS = ["id", "app_id", "role", "message", "summary", "created_at"];
async function appendConversation(auth, entry) {
  const sheetId = await getConversationsSheetId(auth);
  await ensureSheetTab(auth, sheetId, "conversations");
  const sheets = getSheets(auth);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: "conversations!A1:F1"
  });
  if (!res.data.values?.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: "conversations!A1",
      valueInputOption: "RAW",
      requestBody: { values: [[...CONV_HEADERS]] }
    });
  }
  const row = [v4(), entry.app_id, entry.role, entry.message, entry.summary, entry.created_at];
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: "conversations!A:A",
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  });
}
async function getConversationSummaries(auth, appId) {
  try {
    const sheetId = await getConversationsSheetId(auth);
    await ensureSheetTab(auth, sheetId, "conversations");
    const sheets = getSheets(auth);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "conversations!A:F"
    });
    const rows = res.data.values ?? [];
    return rows.slice(1).filter((r) => r[4] && (!appId || r[1] === appId)).map((r) => r[4]);
  } catch {
    return [];
  }
}
async function getAppFeedbacks(auth, appId) {
  try {
    const sheetId = await getConversationsSheetId(auth);
    await ensureSheetTab(auth, sheetId, "conversations");
    const sheets = getSheets(auth);
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "conversations!A:F"
    });
    const rows = res.data.values ?? [];
    return rows.slice(1).filter((r) => r[0] && r[1] === appId && r[4]).map((r) => ({
      id: r[0],
      summary: r[4],
      created_at: r[5]
    }));
  } catch {
    return [];
  }
}
async function deleteConversationEntry(auth, entryId) {
  try {
    const sheetId = await getConversationsSheetId(auth);
    const sheets = getSheets(auth);
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const convSheet = meta.data.sheets?.find((s) => s.properties?.title === "conversations");
    if (!convSheet?.properties) return false;
    const gid = convSheet.properties.sheetId;
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "conversations!A:A"
    });
    const rows = res.data.values ?? [];
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === entryId);
    if (rowIndex === -1) return false;
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: gid,
                dimension: "ROWS",
                startIndex: rowIndex,
                endIndex: rowIndex + 1
              }
            }
          }
        ]
      }
    });
    return true;
  } catch {
    return false;
  }
}
export {
  getAppSchema as a,
  getConversationSummaries as b,
  appendConversation as c,
  deleteConversationEntry as d,
  getAppFeedbacks as e,
  getConfigSheet as f,
  getAppById as g,
  addAppToConfig as h,
  updateAppInConfig as u
};
