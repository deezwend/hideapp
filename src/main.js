const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const i18n = require('./i18n');

let window;
let tray;
let helper;
let ready = false;
let quitting = false;
// 'tr'/'en' is the main process' source of truth so the tray menu is localized
// before the renderer loads. It is persisted next to the Electron user data.
let language = 'tr';
let errorCode = null;
let errorExtra = '';
let state = { enabled: false, windows: [], ready: false, error: null };
let viewState = null;
let windowBounds = null;
let windowMaximized = false;
let closeGeneration = 0;

// This utility has no 3D content. Software drawing reduces the GPU process'
// memory footprint; allow an opt-out for machines that prefer GPU drawing.
if (process.env.HIDEAPP_HARDWARE_ACCELERATION !== '1') app.disableHardwareAcceleration();

const L = (key, params) => i18n.translate(language, key, params);
function languageFile() { return path.join(app.getPath('userData'), 'language.json'); }
function loadLanguage() {
  try { language = i18n.normalizeLanguage(JSON.parse(fs.readFileSync(languageFile(), 'utf8')).language); }
  catch { language = 'tr'; }
}
function saveLanguage() {
  try { fs.writeFileSync(languageFile(), JSON.stringify({ language })); return true; }
  catch { console.error('Language could not be saved'); return false; }
}
function applyError() {
  state.error = [errorCode ? L(errorCode) : '', errorExtra].filter(Boolean).join('\n') || null;
}
function setError(code, extra = '') { errorCode = code; errorExtra = extra; applyError(); }

function showWindow() {
  if (quitting) return;
  closeGeneration++;
  if (!window || window.isDestroyed()) { createWindow(); return; }
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function createWindow() {
  const created = new BrowserWindow({
    ...(windowBounds || { width: 920, height: 640 }), minWidth: 640, minHeight: 430,
    frame: false, backgroundColor: '#f6f7fb', show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
      // A taskbar-minimized window still receives live list updates.
      backgroundThrottling: false,
    },
  });
  window = created;
  created.on('close', async event => {
    if (quitting) return;
    event.preventDefault();
    const generation = ++closeGeneration;
    windowBounds = created.getNormalBounds();
    windowMaximized = created.isMaximized();
    created.hide();
    // Capture transient UI state before releasing its renderer. Bound the
    // wait so an unresponsive renderer cannot keep consuming RAM forever.
    let captureTimer;
    try {
      const captured = await Promise.race([
        created.webContents.executeJavaScript('window.hideAppView?.capture()'),
        new Promise(resolve => { captureTimer = setTimeout(() => resolve(null), 300); }),
      ]);
      if (generation === closeGeneration && captured) viewState = captured;
    } catch { /* Keep the previous view if the renderer has stopped. */ }
    finally { clearTimeout(captureTimer); }
    if (generation === closeGeneration && !created.isDestroyed() && !quitting) created.destroy();
  });
  created.on('closed', () => { if (window === created) window = null; });
  created.once('ready-to-show', () => {
    if (quitting || created.isDestroyed()) return;
    if (windowMaximized) created.maximize();
    created.show();
    created.focus();
  });
  created.on('maximize', () => created.webContents.send('maximized', true));
  created.on('unmaximize', () => created.webContents.send('maximized', false));
  created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  created.webContents.on('will-navigate', event => event.preventDefault());
  created.loadFile(path.join(__dirname, 'index.html'));
}
function refreshTray() {
  if (!tray || tray.isDestroyed()) return;
  tray.setToolTip(L('trayTooltip', { count: state.windows.length }));
  tray.setContextMenu(Menu.buildFromTemplate([
    { id: 'show', label: L('trayShow'), click: showWindow },
    { type: 'separator' },
    { id: 'toggle-hiding', label: L('enableHiding'), type: 'checkbox', checked: state.enabled,
      enabled: state.ready, click: item => send('enable ' + (item.checked ? '1' : '0')) },
    { id: 'restore-all', label: L('trayRestoreAll'), enabled: state.ready && state.windows.length > 0,
      click: () => send('restore-all') },
    { type: 'separator' },
    { id: 'quit', label: L('trayQuit'), click: () => app.quit() },
  ]));
}
function publish() {
  if (window && !window.isDestroyed()) window.webContents.send('state', state);
  refreshTray();
}
function send(command) {
  if (!ready || !helper?.stdin.writable) return false;
  helper.stdin.write(command + '\n');
  return true;
}
function startHelper() {
  if (process.platform !== 'win32') {
    setError('windowsOnly');
    publish();
    return;
  }
  helper = spawn(path.join(__dirname, '..', 'native', 'WindowHost.exe'), [String(process.pid)],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let diagnostics = '';
  helper.stderr.on('data', data => { diagnostics = (diagnostics + data.toString()).slice(-4000); });
  helper.stdin.on('error', () => {});
  readline.createInterface({ input: helper.stdout }).on('line', line => {
    try {
      const event = JSON.parse(line);
      if (event.type === 'ready') {
        ready = true;
        state = { ...state, ready: true, error: null };
      } else if (event.type === 'state') {
        state = { ...state, enabled: event.enabled, windows: event.windows.map(item => ({ ...item, title: item.title ?? L('untitled') })) };
      } else if (event.type === 'error') {
        setError(event.code ?? 'hideFailed');
      }
      publish();
    } catch { /* Ignore non-protocol output from the helper. */ }
  });
  helper.on('error', error => {
    state = { ...state, ready: false, enabled: false };
    setError(null, error.message);
    publish();
  });
  helper.on('exit', () => {
    ready = false;
    if (quitting) { app.quit(); return; }
    state = { ...state, ready: false, enabled: false };
    setError('helperStopped', diagnostics.trim());
    publish();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    loadLanguage();
    createWindow();
    const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'tray-icon.png'));
    tray = new Tray(icon);
    tray.on('click', showWindow);
    tray.on('double-click', showWindow);
    refreshTray();
    startHelper();
  });
}
ipcMain.handle('get-state', () => state);
ipcMain.handle('get-view-state', () => viewState);
ipcMain.handle('enable', (_event, enabled) => {
  if (typeof enabled !== 'boolean') return false;
  errorCode = null;
  errorExtra = '';
  applyError();
  return send('enable ' + (enabled ? '1' : '0'));
});
ipcMain.handle('get-language', () => language);
ipcMain.handle('set-language', (_event, requested) => {
  if (requested !== 'tr' && requested !== 'en') return { ok: false };
  const previous = language;
  language = requested;
  if (!saveLanguage()) { language = previous; return { ok: false }; }
  applyError();
  refreshTray();
  publish();
  return { ok: true };
});
ipcMain.handle('restore', (_event, id) => {
  if (typeof id !== 'string' || !/^\d+$/.test(id)) return false;
  return send('restore ' + id);
});
ipcMain.handle('restore-all', () => send('restore-all'));
ipcMain.on('window-control', (_event, action) => {
  if (!window || window.isDestroyed()) return;
  if (action === 'minimize') window.minimize();
  else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize();
  else if (action === 'close') window.close();
});
app.on('before-quit', event => {
  if (helper && helper.exitCode === null && !quitting) {
    event.preventDefault();
    quitting = true;
    // Let the helper restore all windows before it exits. EOF also restores
    // them if Electron crashes or its pipe closes unexpectedly.
    helper.stdin.end('quit\n');
  } else if (helper && helper.exitCode === null) {
    event.preventDefault();
  } else {
    quitting = true;
  }
});
app.on('will-quit', () => {
  if (tray && !tray.isDestroyed()) tray.destroy();
});
// The tray and native helper own the background lifetime, independent of UI.
app.on('window-all-closed', () => {});
