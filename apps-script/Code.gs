const SHEET_ID = '1uEPMq9wCpCeJoga3EOTyyBKsceV9rWNxBvd8Z1UkPeU';

function ss() {
  return SpreadsheetApp.openById(SHEET_ID);
}

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'paihia-star-ops' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var data = {};
  try {
    if (e.postData && e.postData.contents) data = JSON.parse(e.postData.contents);
  } catch (err) {
    data = (e.parameter || {});
  }
  var action = data.action || 'usedLast';
  var now = new Date();

  if (action === 'usedLast') {
    ss().getSheetByName('UsedLast').appendRow([
      now, data.item || '', data.room || '', data.note || '', 'open'
    ]);
  } else if (action === 'anomaly' || action === 'addBooking') {
    ss().getSheetByName('Anomalies').appendRow([
      now,
      data.guest || '',
      data.room || '',
      data.checkin || '',
      data.checkout || '',
      data.requirements || data.req || '',
      'open'
    ]);
  } else if (action === 'parCount') {
    var par = ss().getSheetByName('PAR');
    var rows = par.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).toLowerCase() === String(data.item || '').toLowerCase()) {
        if (data.on_hand !== undefined && data.on_hand !== '') par.getRange(i + 1, 7).setValue(Number(data.on_hand));
        break;
      }
    }
  }

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, action: action }))
    .setMimeType(ContentService.MimeType.JSON);
}
