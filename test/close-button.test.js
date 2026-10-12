const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

test('Close detection supports Terminal child routing and conservative Chromium regions', { skip: process.platform !== 'win32' }, async () => {
  const { stdout } = await promisify(execFile)('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', path.join(__dirname, 'close-button.ps1'),
  ], { windowsHide: true, timeout: 15000 });
  assert.match(stdout, /assertions passed/);
});
