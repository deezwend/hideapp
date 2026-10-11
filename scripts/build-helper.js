const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

if (process.platform === 'win32') {
  const root = path.resolve(__dirname, '..');
  const compiler = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
  if (!fs.existsSync(compiler)) throw new Error('.NET Framework 4.x C# compiler not found: ' + compiler);
  const result = spawnSync(compiler, [
    '/nologo', '/target:exe', '/platform:x64', '/optimize+', '/main:Entry',
    '/out:' + path.join(root, 'native', 'WindowHost.exe'),
    '/reference:System.Windows.Forms.dll', '/reference:System.Drawing.dll', '/reference:System.Web.Extensions.dll',
    path.join(root, 'native', 'WindowHost.cs'), path.join(root, 'native', 'Entry.cs'),
  ], { windowsHide: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
  console.log('Native helper compiled: native/WindowHost.exe');
}
