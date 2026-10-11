(function (root) {
  const catalogue = typeof module !== 'undefined' && module.exports ? require('./i18n') : root.HideAppI18n;
  function formatHiddenDuration(hiddenAt, now = Date.now(), language = 'tr') {
    if (typeof hiddenAt !== 'number' || !Number.isFinite(hiddenAt) || hiddenAt <= 0) return '—';
    const total = Math.max(0, Math.floor((now - hiddenAt) / 1000));
    const unit = key => catalogue.translate(language, key);
    const parts = [];
    const days = Math.floor(total / 86400);
    if (days) parts.push(days, unit('day'));
    const hours = Math.floor(total / 3600) % 24;
    if (days || hours) parts.push(hours, unit('hour'));
    const minutes = Math.floor(total / 60) % 60;
    if (days || hours || minutes) parts.push(minutes, unit('minute'));
    parts.push(total % 60, unit('second'));
    return parts.join(' ');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { formatHiddenDuration };
  else root.formatHiddenDuration = formatHiddenDuration;
})(globalThis);
