/**
 * Adds a custom menu to export QR codes as PNG files to Drive.
 * Adjust sheet/tab names and columns as needed for your spreadsheet.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('QR Tools')
    .addItem('Export QR PNGs', 'exportQrPngs')
    .addToUi();
}

/**
 * Reads rows from a sheet, generates QR codes, and writes PNG files to Drive.
 * - Input sheet: "QR Data"
 * - Columns: A = label/name, B = data to encode in QR
 * - Output folder: creates/uses a folder named "QR PNG Exports"
 */
function exportQrPngs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('QR Data');
  if (!sheet) throw new Error('Create a sheet named "QR Data" with columns A (label) and B (data).');

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) throw new Error('Add at least one data row beneath the header row.');

  const [header, ...rows] = values;
  const labelIndex = header.findIndex((h) => h.toString().toLowerCase() === 'label');
  const dataIndex = header.findIndex((h) => h.toString().toLowerCase() === 'data');
  if (labelIndex === -1 || dataIndex === -1) {
    throw new Error('Header row must include "Label" and "Data" columns.');
  }

  const folderName = 'QR PNG Exports';
  const folder = getOrCreateFolder_(folderName);
  const createdFiles = [];

  rows.forEach((row, i) => {
    const label = row[labelIndex];
    const payload = row[dataIndex];
    if (!payload) return;

    const qrUrl = buildQrUrl_(payload);
    const response = UrlFetchApp.fetch(qrUrl);
    const blob = response.getBlob().setName(`${sanitize_(label || 'row-' + (i + 2))}.png`);
    const file = folder.createFile(blob);
    createdFiles.push(file.getName());
  });

  SpreadsheetApp.getUi().alert(`Created ${createdFiles.length} PNG file(s) in the "${folderName}" folder.`);
}

function buildQrUrl_(text) {
  const size = '400x400';
  const encoded = encodeURIComponent(text);
  return `https://chart.googleapis.com/chart?chs=${size}&cht=qr&chl=${encoded}&choe=UTF-8`;
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(name);
}

function sanitize_(name) {
  return name.toString().trim().replace(/[\\/:*?"<>|]/g, '-');
}
