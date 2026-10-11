const { spawn } = require('node:child_process');
let executable;
try { executable = require('electron'); }
catch {
  try { executable = require('../.runtime/node_modules/electron'); }
  catch { console.error('Electron bulunamadı. Önce npm install çalıştırın.'); process.exit(1); }
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(executable, process.argv.slice(2), { stdio: 'inherit', env });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
