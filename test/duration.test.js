const test = require('node:test');
const assert = require('node:assert/strict');
const { formatHiddenDuration } = require('../src/duration');
const hiddenAt = 1700000000000;
test('hidden duration formats second, minute, hour and day boundaries', () => {
  for (const [seconds, expected] of [
    [0, '0 sn'], [59, '59 sn'], [60, '1 dk 0 sn'], [3599, '59 dk 59 sn'],
    [3600, '1 sa 0 dk 0 sn'], [3756, '1 sa 2 dk 36 sn'],
    [86400, '1 gün 0 sa 0 dk 0 sn'], [90061, '1 gün 1 sa 1 dk 1 sn'],
  ]) assert.equal(formatHiddenDuration(hiddenAt, hiddenAt + seconds * 1000), expected);
});
test('missing timestamps are not invented, negative durations are clamped', () => {
  for (const value of [undefined, null, NaN, Infinity, 0, -1, '123']) assert.equal(formatHiddenDuration(value), '—');
  assert.equal(formatHiddenDuration(hiddenAt, hiddenAt - 1000), '0 sn');
  assert.equal(formatHiddenDuration(hiddenAt, hiddenAt + 1999), '1 sn');
});
