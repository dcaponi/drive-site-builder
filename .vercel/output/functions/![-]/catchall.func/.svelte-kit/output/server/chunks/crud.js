import { g as getSheets } from "./google.js";
import { g as getAppById } from "./sheets.js";
import { v4 } from "uuid";
async function getDbSheetId(auth, appId) {
  const app = await getAppById(auth, appId);
  if (!app) throw new Error(`App ${appId} not found`);
  if (!app.database_sheet_id) throw new Error(`App ${appId} has no database sheet`);
  return app.database_sheet_id;
}
async function listRecords(auth, appId, table) {
  const spreadsheetId = await getDbSheetId(auth, appId);
  const sheets = getSheets(auth);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${table}!A:ZZ`
  });
  const rows = res.data.values ?? [];
  if (rows.length < 1) return [];
  const headers = rows[0].map(String);
  return rows.slice(1).map((row) => {
    const record = { id: "" };
    headers.forEach((h, i) => {
      record[h] = row[i] ?? "";
    });
    if (!record.id) record.id = String(rows.indexOf(row) + 1);
    return record;
  });
}
async function getRecord(auth, appId, table, id) {
  const records = await listRecords(auth, appId, table);
  return records.find((r) => r.id === id) ?? null;
}
async function createRecord(auth, appId, table, data) {
  const spreadsheetId = await getDbSheetId(auth, appId);
  const sheets = getSheets(auth);
  const headerRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${table}!1:1`
  });
  let headers = (headerRes.data.values?.[0] ?? []).map(String);
  if (headers.length === 0) {
    headers = ["id", ...Object.keys(data).filter((k) => k !== "id")];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${table}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] }
    });
  }
  const id = v4();
  const record = { id, ...data };
  const row = headers.map((h) => h === "id" ? id : record[h] ?? "");
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${table}!A:A`,
    valueInputOption: "RAW",
    requestBody: { values: [row] }
  });
  return record;
}
async function updateRecord(auth, appId, table, id, data) {
  const spreadsheetId = await getDbSheetId(auth, appId);
  const sheets = getSheets(auth);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${table}!A:ZZ`
  });
  const rows = res.data.values ?? [];
  if (rows.length < 1) return null;
  const headers = rows[0].map(String);
  const idColIndex = headers.indexOf("id");
  if (idColIndex === -1) return null;
  const rowIndex = rows.findIndex((r, i) => i > 0 && r[idColIndex] === id);
  if (rowIndex === -1) return null;
  const sheetRowNum = rowIndex + 1;
  const current = { id: "" };
  headers.forEach((h, i) => {
    current[h] = rows[rowIndex][i] ?? "";
  });
  const updated = { ...current, ...data, id };
  const updatedRow = headers.map((h) => updated[h] ?? "");
  const colLetter = columnLetter(headers.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${table}!A${sheetRowNum}:${colLetter}${sheetRowNum}`,
    valueInputOption: "RAW",
    requestBody: { values: [updatedRow] }
  });
  return updated;
}
async function deleteRecord(auth, appId, table, id) {
  const spreadsheetId = await getDbSheetId(auth, appId);
  const sheets = getSheets(auth);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${table}!A:A`
  });
  const idCol = res.data.values ?? [];
  const rowIndex = idCol.findIndex((r, i) => i > 0 && r[0] === id);
  if (rowIndex === -1) return false;
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetMeta = meta.data.sheets?.find(
    (s) => s.properties?.title === table
  );
  if (!sheetMeta) return false;
  const sheetId = sheetMeta.properties?.sheetId;
  const sheetRowNum = rowIndex;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: sheetRowNum,
              endIndex: sheetRowNum + 1
            }
          }
        }
      ]
    }
  });
  return true;
}
function columnLetter(n) {
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result || "A";
}
export {
  createRecord as c,
  deleteRecord as d,
  getRecord as g,
  listRecords as l,
  updateRecord as u
};
