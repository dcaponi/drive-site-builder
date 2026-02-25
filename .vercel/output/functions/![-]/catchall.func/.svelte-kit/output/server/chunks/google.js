import { google } from "googleapis";
function getDrive(auth) {
  return google.drive({ version: "v3", auth });
}
function getSheets(auth) {
  return google.sheets({ version: "v4", auth });
}
export {
  getDrive as a,
  getSheets as g
};
