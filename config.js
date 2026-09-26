// Sheet: https://docs.google.com/spreadsheets/d/1uEPMq9wCpCeJoga3EOTyyBKsceV9rWNxBvd8Z1UkPeU
window.STAR_OPS = {
  SHEET_ID: '1uEPMq9wCpCeJoga3EOTyyBKsceV9rWNxBvd8Z1UkPeU',
  SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwf1vIva6uawvUu3amCiEa8Y9muzfdkUojRF0oyTAy9-_YVN77LQ8cyyxHdZM-x919C/exec',
  csv: function (sheetName) {
    return 'https://docs.google.com/spreadsheets/d/' + this.SHEET_ID +
      '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(sheetName);
  }
};
