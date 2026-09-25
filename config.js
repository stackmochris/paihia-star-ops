// After you deploy Apps Script (see README), paste the Web App URL here.
// Sheet: https://docs.google.com/spreadsheets/d/1uEPMq9wCpCeJoga3EOTyyBKsceV9rWNxBvd8Z1UkPeU
window.STAR_OPS = {
  SHEET_ID: '1uEPMq9wCpCeJoga3EOTyyBKsceV9rWNxBvd8Z1UkPeU',
  SCRIPT_URL: '',
  csv: function (sheetName) {
    return 'https://docs.google.com/spreadsheets/d/' + this.SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheetName);
  }
};
