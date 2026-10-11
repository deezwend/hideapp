const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');
const path = require('node:path');

function start(script, args = []) {
  const process = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.resolve(script), ...args], { windowsHide: true, env: { ...globalThis.process.env, HIDEAPP_TEST: '1' } });
  const events = [];
  let stderr = '';
  process.stderr.on('data', data => { stderr += data; });
  process.stdin.on('error', () => {});
  createInterface({ input: process.stdout }).on('line', line => {
    try { events.push(JSON.parse(line)); } catch { events.push(line); }
  });
  return {
    process, events,
    send: line => process.stdin.write(line + '\n'),
    async wait(predicate, timeout = 12000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        const index = events.findIndex(predicate);
        if (index >= 0) return events.splice(index, 1)[0];
        if (process.exitCode !== null) throw new Error('Process exited: ' + stderr);
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('Timed out: ' + JSON.stringify(events) + '\n' + stderr);
    },
  };
}

// Showing a window only posts the change to the target UI thread, so the
// fixture must be polled until it observes the requested state.
async function expectVisibility(fixture, expected) {
  for (let attempt = 0; attempt < 40; attempt++) {
    fixture.send('visible');
    const answer = await fixture.wait(event => typeof event === 'string' && (event.startsWith('visible') || event.startsWith('hidden')), 3000);
    if (answer.startsWith(expected)) return answer;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Window never became ' + expected);
}

test('Native hidden timestamp survives state publications', { skip: process.platform !== 'win32', timeout: 20000 }, async t => {
  const helper = start('native/start.ps1', ['-OwnerPid', String(process.pid)]);
  const fixture = start('test/fixture.ps1');
  t.after(() => {
    if (helper.process.exitCode === null) helper.process.stdin.end('quit\n');
    if (fixture.process.exitCode === null) fixture.process.stdin.end('quit\n');
  });
  await helper.wait(event => event.type === 'ready');
  const id = (await fixture.wait(event => typeof event === 'string' && event.startsWith('ready='))).slice(6);
  helper.send('enable 1');
  await helper.wait(event => event.type === 'state' && event.enabled);
  const requestedAt = Date.now();
  helper.send('test-hide ' + id);
  const hidden = await helper.wait(event => event.type === 'state' && event.windows.length === 1);
  const timestamp = hidden.windows[0].hiddenAt;
  assert.ok(Number.isSafeInteger(timestamp) && timestamp >= requestedAt && timestamp <= Date.now());
  await expectVisibility(fixture, 'hidden');
  helper.send('enable 0');
  const disabled = await helper.wait(event => event.type === 'state' && !event.enabled && event.windows.length === 1);
  assert.equal(disabled.windows[0].hiddenAt, timestamp);
});
test('Native window hide preserves process, restores individually, all and on EOF', { skip: process.platform !== 'win32', timeout: 45000 }, async t => {
  const helper = start('native/start.ps1', ['-OwnerPid', String(process.pid)]);
  const fixture = start('test/fixture.ps1');
  t.after(() => {
    if (helper.process.exitCode === null) helper.process.stdin.end('quit\n');
    if (fixture.process.exitCode === null) fixture.process.stdin.end('quit\n');
  });
  await helper.wait(event => event.type === 'ready');
  const fixtureId = (await fixture.wait(event => typeof event === 'string' && event.startsWith('ready='))).slice(6);
  await expectVisibility(fixture, 'visible');
  helper.send('enable 1');
  await helper.wait(event => event.type === 'state' && event.enabled);
  const requestedAt = Date.now();
  helper.send('test-hide ' + fixtureId);
  const hidden = await helper.wait(event => event.type === 'state' && event.windows.length === 1);
  assert.equal(hidden.windows[0].title, 'HideApp integration fixture');
  assert.match(hidden.windows[0].icon, /^data:image\/png;base64,/);
  assert.ok(hidden.windows[0].hiddenAt >= requestedAt && hidden.windows[0].hiddenAt <= Date.now());
  await expectVisibility(fixture, 'hidden');
  assert.equal(fixture.process.exitCode, null, 'Target process remains running');
  helper.send('restore ' + hidden.windows[0].id);
  await helper.wait(event => event.type === 'state' && event.windows.length === 0);
  await expectVisibility(fixture, 'visible');
  helper.send('test-hide ' + fixtureId);
  await helper.wait(event => event.type === 'state' && event.windows.length === 1);
  helper.send('restore-all');
  await helper.wait(event => event.type === 'state' && event.windows.length === 0);
  await expectVisibility(fixture, 'visible');
  helper.send('test-hide ' + fixtureId);
  await helper.wait(event => event.type === 'state' && event.windows.length === 1);
  helper.send('enable 0');
  await helper.wait(event => event.type === 'state' && !event.enabled && event.windows.length === 1);
  helper.process.stdin.end();
  await new Promise((resolve, reject) => {
    helper.process.once('exit', code => code === 0 ? resolve() : reject(new Error('Helper exit ' + code)));
  });
  await expectVisibility(fixture, 'visible');
});
