(function(){
  var originalUpload = window.handleReadingPdfUpload;
  if (typeof originalUpload !== 'function') return;

  window.handleReadingPdfUpload = async function(event) {
    await originalUpload(event);

    if (typeof READING_MODE === 'undefined' || READING_MODE !== 'residencial') return;
    if (typeof readingGpsSets !== 'function') return;
    if (!Array.isArray(readingOrders) || readingOrders.length === 0) return;

    var sets = readingGpsSets();
    if (sets && sets.missing && sets.missing.length) {
      var tab = document.getElementById('tabLoad');
      if (typeof switchReadingTab === 'function') switchReadingTab('load', tab);
      if (typeof showReadingToast === 'function') {
        showReadingToast('Faltan ' + sets.missing.length + ' GPS · copiá las Localizaciones para Telegram');
      }
    }
  };
})();