const test = require('node:test');
const assert = require('node:assert/strict');
const theme = require('../src/theme');

test('missing and damaged preferences use orange defaults', () => {
  for (const value of [null, undefined, false, 'bad', [], {}]) assert.deepEqual(theme.normalize(value), theme.defaults);
  assert.deepEqual(theme.normalize({ palette: 'purple', font: 'unknown', textSize: 'large', objectSize: NaN, radius: Infinity }), theme.defaults);
});
test('only supported palettes and fonts can be loaded', () => {
  assert.equal(theme.palettes.length, 6);
  assert.equal(theme.palettes.includes('purple'), false);
  for (const palette of theme.palettes) assert.equal(theme.normalize({ palette }).palette, palette);
  for (const font of Object.keys(theme.fonts)) assert.equal(theme.normalize({ font }).font, font);
  assert.equal(theme.normalize({ font: '__proto__' }).font, 'segoe');
});
test('dark mode is preserved and older or invalid preferences stay light', () => {
  assert.equal(theme.normalize({ mode: 'dark' }).mode, 'dark');
  for (const mode of [undefined, null, 'purple', 'system', true]) assert.equal(theme.normalize({ mode }).mode, 'light');
  const legacy = { palette: 'ocean', font: 'verdana', textSize: 120, objectSize: 110, radius: 8 };
  assert.deepEqual(theme.normalize(legacy), { ...legacy, mode: 'light' });
});
test('numeric settings are bounded and rounded', () => {
  assert.deepEqual(theme.normalize({ textSize: 1000, objectSize: -50, radius: 300 }), { ...theme.defaults, textSize: 140, objectSize: 85, radius: 20 });
  assert.deepEqual(theme.normalize({ textSize: -1, objectSize: 1000, radius: -5 }), { ...theme.defaults, textSize: 85, objectSize: 130, radius: 0 });
  assert.equal(theme.normalize({ textSize: 102.7 }).textSize, 103);
});
test('normalization drops unrelated fields and does not mutate defaults', () => {
  const source = { ...theme.defaults, enabled: true, windows: [1] };
  assert.deepEqual(theme.normalize(source), theme.defaults);
  const result = theme.normalize(source);
  result.palette = 'ocean';
  assert.equal(theme.defaults.palette, 'orange');
  assert.equal(source.enabled, true);
});
