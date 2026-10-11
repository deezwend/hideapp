const test = require('node:test');
const assert = require('node:assert/strict');
const { messages, normalizeLanguage, translate } = require('../src/i18n');
const { formatHiddenDuration } = require('../src/duration');

test('Turkish and English catalogues expose exactly the same keys', () => {
  assert.deepEqual(Object.keys(messages.tr).sort(), Object.keys(messages.en).sort());
  for (const [key, value] of Object.entries(messages.tr)) {
    assert.equal(typeof value, 'string', key + ' must be a string');
    assert.ok(value.length > 0, key + ' must not be empty');
  }
  for (const [key, value] of Object.entries(messages.en)) assert.ok(value.length > 0, key + ' must not be empty');
});
test('translations never leak the other language', () => {
  const turkishOnly = ['gizli', 'Gizlenen', 'uygulama', 'Türkçe'];
  for (const value of Object.values(messages.en)) {
    for (const word of turkishOnly) assert.equal(value.includes(word), false, value + ' contains ' + word);
  }
  assert.match(messages.tr.enableHiding, /gizlemeyi aktifleştir/);
  assert.match(messages.en.enableHiding, /Enable application hiding/);
  assert.match(messages.tr.trayQuit, /kapat/);
  assert.match(messages.en.trayQuit, /Quit HideApp/);
});
test('placeholders are replaced and unknown keys never crash the UI', () => {
  assert.equal(translate('tr', 'trayTooltip', { count: 3 }), 'HideApp · 3 gizli pencere');
  assert.equal(translate('en', 'trayTooltip', { count: 1 }), 'HideApp · 1 hidden windows');
  assert.equal(translate('en', 'showWindow', { title: 'Discord' }), 'Show the Discord window');
  assert.equal(translate('tr', 'showWindow', { title: 'Discord' }), 'Discord penceresini göster');
  assert.equal(translate('en', 'unknown-key'), 'unknown-key');
  assert.equal(translate('tr', 'trayTooltip'), 'HideApp · {count} gizli pencere');
});
test('language normalization always falls back to Turkish', () => {
  assert.equal(normalizeLanguage('en'), 'en');
  assert.equal(normalizeLanguage('tr'), 'tr');
  for (const value of [undefined, null, '', 'de', 'EN', 'en-US', 42, {}, []]) assert.equal(normalizeLanguage(value), 'tr');
});
test('hidden duration formatting is localized', () => {
  const hiddenAt = 1700000000000;
  assert.equal(formatHiddenDuration(hiddenAt, hiddenAt + 3756000, 'tr'), '1 sa 2 dk 36 sn');
  assert.equal(formatHiddenDuration(hiddenAt, hiddenAt + 3756000, 'en'), '1 h 2 min 36 s');
  assert.equal(formatHiddenDuration(hiddenAt, hiddenAt + 90061 * 1000, 'en'), '1 d 1 h 1 min 1 s');
  assert.equal(formatHiddenDuration(hiddenAt, hiddenAt + 5000, 'en'), '5 s');
  assert.equal(formatHiddenDuration(undefined, Date.now(), 'en'), '—');
  assert.equal(formatHiddenDuration(hiddenAt, hiddenAt + 1000), '1 sn');
});
