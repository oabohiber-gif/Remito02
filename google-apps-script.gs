/*
 * Remito eWire → Google Sheets receiver
 *
 * 1. Open the target Google Sheet.
 * 2. Extensions → Apps Script.
 * 3. Replace Code.gs with this file and save.
 * 4. Deploy → New deployment → Web app.
 * 5. Execute as: Me. Who has access: Anyone.
 * 6. Copy the /exec URL into Remito's eWire tab.
 */

const EWIRE_SHEET_NAME = 'eWire Transactions';

const EWIRE_HEADERS = [
  'Date', 'Reference #', 'Benef. Name', 'Benef. Phone #', 'Receive Amount',
  'CCY', 'Agent Fees', 'Country', 'City', 'Agent', 'Agent Phone',
  'Agent Payment Method', 'Pick-Up Location', 'Sender Name', 'Sender Phone #',
  'Paid Amount (CAD)', 'Paid Amount (USD)', 'Sender Payment Method', 'Teller',
  'Record ID', 'Received by Sheet At'
];

function doGet() {
  return jsonResponse_({ ok: true, service: 'Remito eWire receiver' });
}

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || '{}');
    if (payload.action !== 'appendTransactions' || !Array.isArray(payload.transactions)) {
      throw new Error('Invalid eWire payload.');
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = spreadsheet.getSheetByName(EWIRE_SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(EWIRE_SHEET_NAME);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, EWIRE_HEADERS.length).setValues([EWIRE_HEADERS]);
      sheet.getRange(1, 1, 1, EWIRE_HEADERS.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const existingIds = sheet.getLastRow() > 1
      ? new Set(sheet.getRange(2, 20, sheet.getLastRow() - 1, 1).getDisplayValues().flat())
      : new Set();

    const rows = payload.transactions
      .filter(item => item && item.id && !existingIds.has(String(item.id)))
      .map(item => [
        item.date || '', item.reference || '', item.beneficiaryName || '',
        item.beneficiaryPhone || '', Number(item.receiveAmount) || 0, item.ccy || '',
        Number(item.agentFees) || 0, item.country || '', item.city || '',
        item.agentName || '', item.agentPhone || '', item.agentPaymentMethod || '',
        item.pickupLocation || '', item.senderName || '', item.senderPhone || '',
        Number(item.paidCad) || 0, Number(item.paidUsd) || 0,
        item.senderPaymentMethod || '', item.teller || '', item.id, new Date()
      ]);

    if (rows.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, EWIRE_HEADERS.length).setValues(rows);
      sheet.autoResizeColumns(1, EWIRE_HEADERS.length);
    }

    return jsonResponse_({ ok: true, inserted: rows.length });
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error.message || error) });
  }
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
