# hintonbuildings

## Google Sheets QR code export to PNG

1. Open your Google Sheet and choose **Extensions → Apps Script**.
2. Create a new script file and paste the contents of `qr_png_export.gs` from this repository.
3. In the sheet, create a tab named **QR Data** with headers `Label` and `Data` in row 1. Add your rows beneath (each row becomes a QR code).
4. Refresh the sheet; a **QR Tools** menu will appear. Click **Export QR PNGs**.
5. PNG files are generated in Google Drive inside a folder named **QR PNG Exports**. File names come from the `Label` column (sanitized for filesystem safety).

### How it works
- The script builds QR code images using the Google Chart API and saves them as PNG blobs in Drive.
- It validates that the header row contains `Label` and `Data` columns and that at least one data row exists.
- File names are cleaned of characters that are invalid in Drive file names.

### Customization
- Change the sheet name by editing the `sheet = ss.getSheetByName('QR Data');` line.
- Adjust the QR size in `buildQrUrl_` by setting `size` (e.g., `300x300`).
- Add more columns to include in the file name or to log metadata (e.g., append date or user info before saving).
- Add triggers to automate exports on a schedule if desired.
