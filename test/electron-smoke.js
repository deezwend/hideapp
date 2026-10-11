const { app, BrowserWindow, Tray } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const childProcess = require('node:child_process');
const { createInterface } = require('node:readline');
let nativeHelper;
const originalSpawn = childProcess.spawn;
childProcess.spawn = function (exe, args, options) {
  const child = originalSpawn(exe, args, options);
  if (path.basename(exe) === 'WindowHost.exe') nativeHelper = child;
  return child;
};
process.env.HIDEAPP_TEST = '1';
// Keep the smoke test independent of an already running HideApp instance.
app.setPath('userData', path.join(app.getPath('temp'), 'hideapp-smoke-' + process.pid));
// Capture the real tray/menu without exposing test-only renderer APIs.
let applicationTray;
let trayMenu;
let trayTooltip;
const setContextMenu = Tray.prototype.setContextMenu;
Tray.prototype.setContextMenu = function (menu) {
  applicationTray = this;
  trayMenu = menu;
  return setContextMenu.call(this, menu);
};
const setToolTip = Tray.prototype.setToolTip;
Tray.prototype.setToolTip = function (value) {
  trayTooltip = value;
  return setToolTip.call(this, value);
};
require(process.env.HIDEAPP_SMOKE_APP || '../src/main');
let timer = setTimeout(() => { console.error('Electron smoke test timed out'); app.exit(1); }, 60000);
app.whenReady().then(async () => {
  try {
    let window;
    for (let attempt = 0; attempt < 150; attempt++) {
      window = BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isLoading()) {
        const ready = await window.webContents.executeJavaScript('Boolean(window.hideApp && document.querySelector("#enabled"))');
        if (ready) break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(window);
    assert.equal(window.isDestroyed(), false);
    const title = await window.webContents.executeJavaScript('document.title');
    assert.equal(title, 'HideApp');
    assert.equal(await window.webContents.executeJavaScript('document.querySelector(".titlebar").textContent.trim()'), '');
    assert.equal(await window.webContents.executeJavaScript('document.querySelector("#status")'), null);
    for (let attempt = 0; attempt < 150; attempt++) {
      const state = await window.webContents.executeJavaScript('window.hideApp.getState()');
      if (state.error) throw new Error(state.error);
      if (state.ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await window.webContents.executeJavaScript('(async () => { const s = await window.hideApp.getState(); return s.ready; })()'), true);
    await window.webContents.executeJavaScript('window.hideApp.setEnabled(true)');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await window.webContents.executeJavaScript('document.querySelector("#enabled").checked'), true);
    await window.webContents.executeJavaScript('window.hideApp.setEnabled(false)');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await window.webContents.executeJavaScript('document.querySelector("#enabled").checked'), false);
    const evaluate = async source => {
      try { return await window.webContents.executeJavaScript(source); }
      catch (error) { console.error('Renderer evaluation failed:', source); throw error; }
    };
    assert.equal(window.webContents.getBackgroundThrottling(), false);
    assert.ok(applicationTray && !applicationTray.isDestroyed());
    assert.equal(trayMenu.getMenuItemById('toggle-hiding').enabled, true);
    assert.equal(trayMenu.getMenuItemById('restore-all').enabled, false);
    const waitForDestroyed = async previous => {
      for (let attempt = 0; attempt < 40 && !previous.isDestroyed(); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(previous.isDestroyed(), true);
      assert.equal(BrowserWindow.getAllWindows().length, 0);
      assert.ok(applicationTray && !applicationTray.isDestroyed());
    };
    const waitForReopened = async () => {
      for (let attempt = 0; attempt < 100; attempt++) {
        window = BrowserWindow.getAllWindows()[0];
        if (window && window.isVisible() && !window.webContents.isLoading()) {
          try { if (await evaluate('Boolean(window.hideApp && window.hideAppView)')) return; } catch {}
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('Tray window did not reopen');
    };
    // Both custom X and native close release the renderer while the tray stays alive.
    window.setSize(800, 560);
    await evaluate(`(() => {
      document.querySelector('#search-bar').hidden = false;
      document.querySelector('#app-search').value = 'persisted query';
      document.querySelector('#app-search').focus();
    })()`);
    const previous = window;
    await evaluate('document.querySelector("#close").click()');
    await waitForDestroyed(previous);
    trayMenu.getMenuItemById('show').click();
    await waitForReopened();
    assert.equal((await evaluate('window.hideApp.getState()')).ready, true);
    assert.equal(await evaluate('document.querySelector("#app-search").value'), 'persisted query');
    assert.equal(await evaluate('document.querySelector("#search-bar").hidden'), false);
    assert.equal(await evaluate('document.activeElement.id'), 'app-search');
    assert.deepEqual(window.getSize(), [800, 560]);
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))');
    const second = window;
    window.close();
    await waitForDestroyed(second);
    applicationTray.emit('click');
    await waitForReopened();
    const toggleItem = trayMenu.getMenuItemById('toggle-hiding');
    assert.equal(toggleItem.checked, false);
    toggleItem.click(toggleItem);
    // Wait for the helper acknowledgement, not merely the local checkbox.
    for (let attempt = 0; attempt < 30 && !(await evaluate('window.hideApp.getState()')).enabled; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal((await evaluate('window.hideApp.getState()')).enabled, true);
    await evaluate('window.hideApp.setEnabled(false)');
    for (let attempt = 0; attempt < 30 && (await evaluate('window.hideApp.getState()')).enabled; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(trayMenu.getMenuItemById('toggle-hiding').checked, false);
    const actualState = await evaluate('window.hideApp.getState()');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".table-surface")).backgroundImage'), 'none');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("th:nth-child(2)")).borderLeftColor'), 'rgba(0, 0, 0, 0)');
    await evaluate(`(() => {
      window.backgroundListUpdate = new Promise(resolve => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('#windows tr')) {
            observer.disconnect();
            requestAnimationFrame(() => resolve({
              count: document.querySelector('#count').textContent,
              title: document.querySelector('.app-title').textContent,
              emptyHidden: document.querySelector('#empty').hidden
            }));
          }
        });
        observer.observe(document.querySelector('#windows'), { childList: true });
      });
    })()`);
    window.minimize();
    for (let attempt = 0; attempt < 30 && !window.isMinimized(); attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(window.isMinimized(), true);
    window.webContents.send('state', { ...actualState, windows: [
      { id: '123', title: 'Background update fixture', pid: 123, icon: null },
    ] });
    let updateTimer;
    try {
      const update = await Promise.race([
        evaluate('window.backgroundListUpdate'),
        new Promise((_resolve, reject) => { updateTimer = setTimeout(() => reject(new Error('List did not render while minimized')), 3000); }),
      ]);
      assert.deepEqual(update, { count: '1', title: 'Background update fixture', emptyHidden: true });
      assert.equal(window.isMinimized(), true);
    } finally { clearTimeout(updateTimer); }
    window.webContents.send('state', actualState);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate('document.querySelector("#count").textContent'), '0');
    window.restore();
    assert.equal(await evaluate('document.querySelector("#search-bar").hidden'), true);
    const hiddenAt = Date.now() - 3756000;
    const searchWindows = [
      { id: '201', title: 'Discord', icon: null, hiddenAt },
      { id: '202', title: 'Not Defteri', icon: null },
      { id: '203', title: 'İŞ Planı', icon: null },
    ];
    window.webContents.send('state', { ...actualState, windows: searchWindows });
    await new Promise(resolve => setTimeout(resolve, 100));
    const shortcut = () => evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true }))');
    const search = value => evaluate(`(() => {
      const input = document.querySelector('#app-search');
      input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('input'));
      return { titles: [...document.querySelectorAll('.app-title')].map(node => node.textContent), count: document.querySelector('#count').textContent };
    })()`);
    await shortcut();
    assert.equal(await evaluate('document.querySelector("#search-bar").hidden'), false);
    assert.equal(await evaluate('document.activeElement.id'), 'app-search');
    assert.deepEqual(await search('  DISCORD  '), { titles: ['Discord'], count: '1 / 3' });
    const timerBefore = await evaluate(`(() => {
      updateHiddenDurations();
      window.timerCell = document.querySelector('.hidden-duration');
      window.timerRow = document.querySelector('#windows tr');
      return { text: window.timerCell.textContent, hiddenAt: Number(window.timerCell.dataset.hiddenAt) };
    })()`);
    assert.equal(timerBefore.hiddenAt, hiddenAt);
    assert.match(timerBefore.text, /^1 sa 2 dk \d+ sn$/);
    // Allow both the interval phase and the next whole-second boundary.
    await new Promise(resolve => setTimeout(resolve, 2200));
    const timerAfter = await evaluate(`({
      text: document.querySelector('.hidden-duration').textContent,
      sameCell: window.timerCell === document.querySelector('.hidden-duration'),
      sameRow: window.timerRow === document.querySelector('#windows tr'),
      query: document.querySelector('#app-search').value,
      active: document.querySelector('.search-active').dataset.windowId,
      divider: getComputedStyle(document.querySelector('td:nth-child(2)')).borderLeftStyle,
      background: getComputedStyle(document.querySelector('.table-surface')).backgroundImage
    })`);
    assert.notEqual(timerAfter.text, timerBefore.text);
    assert.equal(timerAfter.sameCell && timerAfter.sameRow, true);
    assert.equal(timerAfter.active, '201');
    assert.equal(timerAfter.query, '  DISCORD  ');
    assert.equal(timerAfter.divider, 'solid');
    assert.equal(await evaluate('document.querySelector("#windows tr").children.length'), 4);
    assert.equal(await evaluate('document.querySelector("#windows tr td:nth-child(3) .hidden-duration") !== null'), true);
    assert.equal(await evaluate('document.querySelector("#windows tr td:nth-child(4) .restore-button") !== null'), true);
    assert.equal(await evaluate('getComputedStyle(document.querySelector("td:nth-child(4)")).borderLeftStyle'), 'solid');
    assert.match(timerAfter.background, /linear-gradient/);
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".search-highlight")].map(node => node.textContent)'), ['Discord']);
    assert.deepEqual(await evaluate('searchRanges("😀 Discord", normalizeSearch("discord"))'), [[3, 10]]);
    assert.deepEqual(await evaluate('searchRanges("I\\u0307Ş Planı", normalizeSearch("iş"))'), [[0, 3]]);
    await shortcut();
    assert.equal(await evaluate('document.querySelector("#search-bar").hidden'), false);
    assert.deepEqual(await search('iş'), { titles: ['İŞ Planı'], count: '1 / 3' });
    assert.equal(await evaluate('document.querySelector(".search-highlight").textContent'), 'İŞ');
    assert.deepEqual(await search('bulunmayan'), { titles: [], count: '0 / 3' });
    assert.equal(await evaluate('document.querySelector("#empty").hidden'), false);
    assert.equal(await evaluate('document.querySelector("#empty h3").textContent'), 'Aramayla eşleşen uygulama yok');
    assert.equal(await evaluate('getComputedStyle(document.querySelector(".table-surface")).backgroundImage'), 'none');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("th:nth-child(3)")).borderLeftColor'), 'rgba(0, 0, 0, 0)');
    assert.equal(await evaluate('getComputedStyle(document.querySelector("th:nth-child(4)")).borderLeftColor'), 'rgba(0, 0, 0, 0)');
    assert.equal(await evaluate('document.querySelector("#restore-all").disabled'), false);
    assert.equal(await evaluate('document.querySelector("#search-prev").disabled && document.querySelector("#search-next").disabled'), true);
    assert.deepEqual(await search(''), { titles: ['Discord', 'Not Defteri', 'İŞ Planı'], count: '3' });
    await search('discord');
    window.webContents.send('state', { ...actualState, windows: [...searchWindows, { id: '204', title: 'Discord Canary', icon: null }] });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await evaluate('document.querySelector("#count").textContent'), '2 / 4');
    assert.equal(await evaluate('Number(document.querySelector("#window-row-201 .hidden-duration").dataset.hiddenAt)'), hiddenAt);
    assert.equal(await evaluate('document.querySelector("#app-search").value'), 'discord');
    assert.equal(await evaluate('document.querySelector("#search-next").disabled'), false);
    const activeSearch = () => evaluate('document.querySelector(".search-active").dataset.windowId');
    assert.equal(await activeSearch(), '201');
    await evaluate('document.querySelector("#search-next").click()');
    assert.equal(await activeSearch(), '204');
    await evaluate('document.querySelector("#search-prev").click()');
    assert.equal(await activeSearch(), '201');
    await evaluate('document.querySelector("#search-prev").click()');
    assert.equal(await activeSearch(), '204');
    await evaluate('document.querySelector("#app-search").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }))');
    assert.equal(await activeSearch(), '201');
    await evaluate('document.querySelector("#app-search").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true }))');
    assert.equal(await activeSearch(), '204');
    assert.equal(await evaluate('document.querySelector("#app-search").getAttribute("aria-activedescendant")'), 'window-row-204');
    const highlightColors = () => evaluate(`(() => {
      const style = getComputedStyle(document.querySelector('.search-highlight'));
      return [style.backgroundColor, style.color];
    })()`);
    assert.deepEqual(await highlightColors(), ['rgb(240, 205, 174)', 'rgb(166, 76, 12)']);
    await evaluate(`(() => {
      const mode = document.querySelector('#theme-mode'); mode.value = 'dark'; mode.dispatchEvent(new Event('change'));
      document.querySelector('input[name="palette"][value="forest"]').click();
    })()`);
    assert.deepEqual(await highlightColors(), ['rgb(77, 104, 64)', 'rgb(161, 216, 143)']);
    await evaluate('document.querySelector("#appearance-reset").click()');
    // The active row survives updates, and safely falls back if it disappears.
    window.webContents.send('state', { ...actualState, windows: [searchWindows[0],
      { id: '205', title: '<img src=x> Discord Discord', icon: null },
    ] });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await activeSearch(), '201');
    assert.equal(await evaluate('document.querySelector("#window-row-205 .app-title").textContent'), '<img src=x> Discord Discord');
    assert.equal(await evaluate('document.querySelector("#window-row-205 .app-title img")'), null);
    assert.equal(await evaluate('document.querySelectorAll("#window-row-205 .search-highlight").length'), 2);
    window.webContents.send('state', { ...actualState, windows: Array.from({ length: 40 }, (_, index) => ({ id: String(300 + index), title: 'Discord ' + index, icon: null })) });
    await new Promise(resolve => setTimeout(resolve, 100));
    await evaluate('document.querySelector("#search-prev").click()');
    assert.equal(await activeSearch(), '339');
    assert.equal(await evaluate('document.querySelector(".table-container").scrollTop > 0'), true);
    window.webContents.send('state', { ...actualState, windows: [...searchWindows, { id: '204', title: 'Discord Canary', icon: null }] });
    await new Promise(resolve => setTimeout(resolve, 100));
    await evaluate('document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))');
    assert.equal(await evaluate('document.querySelector("#search-bar").hidden'), true);
    assert.equal(await evaluate('document.querySelector("#windows").children.length'), 4);
    assert.equal(await evaluate('document.querySelectorAll(".search-highlight, .search-active").length'), 0);
    await shortcut();
    await search('discord');
    await evaluate('document.querySelector("#search-close").click()');
    assert.equal(await evaluate('document.querySelector("#search-bar").hidden'), true);
    assert.equal(await evaluate('document.querySelector("#app-search").value'), '');
    window.webContents.send('state', actualState);
    await new Promise(resolve => setTimeout(resolve, 100));
    const initialMetrics = await evaluate(`({
      text: parseFloat(getComputedStyle(document.querySelector('.toggle-label strong')).fontSize),
      icon: document.querySelector('.switch').getBoundingClientRect().width
    })`);
    await evaluate('document.querySelector("#appearance-open").click()');
    assert.equal(await evaluate('document.querySelector("#appearance-dialog").open'), true);
    const paletteColors = [];
    for (const palette of ['orange', 'ocean', 'teal', 'forest', 'crimson', 'slate']) {
      const result = await evaluate(`(() => {
        const radio = document.querySelector('input[name="palette"][value="${palette}"]');
        radio.click();
        return { palette: document.documentElement.dataset.palette, color: getComputedStyle(document.querySelector('.empty-icon')).color };
      })()`);
      assert.equal(result.palette, palette);
      paletteColors.push(result.color);
    }
    assert.equal(new Set(paletteColors).size, 6);
    await evaluate(`(() => {
      const mode = document.querySelector('#theme-mode');
      mode.value = 'dark'; mode.dispatchEvent(new Event('change'));
    })()`);
    for (const palette of ['orange', 'ocean', 'teal', 'forest', 'crimson', 'slate']) {
      const dark = await evaluate(`(() => {
        document.querySelector('input[name="palette"][value="${palette}"]').click();
        return {
          mode: document.documentElement.dataset.mode,
          scheme: getComputedStyle(document.documentElement).colorScheme,
          background: getComputedStyle(document.documentElement).backgroundColor,
          titlebar: getComputedStyle(document.querySelector('.titlebar')).backgroundColor,
          dialog: getComputedStyle(document.querySelector('dialog')).backgroundColor,
          text: getComputedStyle(document.body).color
        };
      })()`);
      assert.deepEqual(dark, { mode: 'dark', scheme: 'dark', background: 'rgb(23, 26, 28)', titlebar: 'rgb(34, 38, 41)', dialog: 'rgb(34, 38, 41)', text: 'rgb(240, 241, 242)' });
    }
    await evaluate(`(() => {
      const font = document.querySelector('#font');
      font.value = 'verdana'; font.dispatchEvent(new Event('change'));
      const text = document.querySelector('#textSize');
      text.value = '140'; text.dispatchEvent(new Event('input'));
      const size = document.querySelector('#objectSize');
      size.value = '130'; size.dispatchEvent(new Event('input'));
      const radius = document.querySelector('#radius');
      radius.value = '20'; radius.dispatchEvent(new Event('input'));
    })()`);
    const enlarged = await evaluate(`({
      text: parseFloat(getComputedStyle(document.querySelector('.toggle-label strong')).fontSize),
      icon: document.querySelector('.switch').getBoundingClientRect().width,
      font: getComputedStyle(document.body).fontFamily,
      radius: getComputedStyle(document.querySelector('.activation')).borderRadius,
      pageOverflow: document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth,
      dialogOverflow: document.querySelector('dialog').scrollWidth > document.querySelector('dialog').clientWidth
    })`);
    assert.ok(Math.abs(enlarged.text / initialMetrics.text - 1.4) < .01);
    assert.ok(Math.abs(enlarged.icon / initialMetrics.icon - 1.3) < .01);
    assert.match(enlarged.font, /Verdana/i);
    assert.equal(enlarged.radius, '20px');
    assert.equal(enlarged.pageOverflow, false);
    assert.equal(enlarged.dialogOverflow, false);
    const reload = () => new Promise(resolve => {
      window.webContents.once('did-finish-load', resolve);
      window.webContents.reload();
    });
    await reload();
    const saved = await evaluate(`({
      mode: document.querySelector('#theme-mode').value,
      palette: document.documentElement.dataset.palette,
      font: document.querySelector('#font').value,
      textSize: document.querySelector('#textSize').value,
      objectSize: document.querySelector('#objectSize').value,
      radius: document.querySelector('#radius').value
    })`);
    assert.deepEqual(saved, { mode: 'dark', palette: 'slate', font: 'verdana', textSize: '140', objectSize: '130', radius: '20' });
    // Check minimum-window layout with the largest available sizes.
    window.setSize(640, 430);
    await evaluate('document.querySelector("#appearance-open").click()');
    assert.equal(await evaluate("document.querySelector('dialog').scrollWidth > document.querySelector('dialog').clientWidth"), false);
    assert.equal(await evaluate("document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth"), false);
    await evaluate('document.querySelector("#appearance-reset").click()');
    const reset = await evaluate(`JSON.parse(localStorage.getItem('hideapp.appearance.v1'))`);
    assert.deepEqual(reset, { mode: 'light', palette: 'orange', font: 'segoe', textSize: 100, objectSize: 100, radius: 12 });
    assert.equal(await evaluate('document.documentElement.dataset.mode'), 'light');
    assert.equal(await evaluate('getComputedStyle(document.documentElement).colorScheme'), 'light');
    assert.equal(await evaluate('document.querySelector("#enabled").checked'), false);
    await evaluate('document.querySelector("#appearance-close").click()');
    assert.equal(await evaluate('document.querySelector("#appearance-dialog").open'), false);
    await evaluate("localStorage.setItem('hideapp.appearance.v1', '{broken json')");
    await reload();
    assert.equal(await evaluate('document.documentElement.dataset.palette'), 'orange');
    assert.equal(await evaluate('document.querySelector("#textSize").value'), '100');
    await evaluate('document.querySelector("#appearance-reset").click()');
    // Language switching updates the renderer, timers and the tray menu.
    assert.equal(await evaluate('document.documentElement.lang'), 'tr');
    assert.equal(await evaluate('document.querySelector("#app-language").value'), 'tr');
    assert.equal((await evaluate('window.hideApp.getLanguage()')), 'tr');
    assert.equal(await evaluate('document.querySelector("#empty h3").textContent'), 'Henüz gizlenen uygulama yok');
    assert.equal(await evaluate('window.hideApp.setLanguage("de").then(result => result.ok)'), false);
    assert.equal((await evaluate('window.hideApp.getLanguage()')), 'tr');
    await evaluate(`(() => { const select = document.querySelector('#app-language'); select.value = 'en'; select.dispatchEvent(new Event('change')); })()`);
    for (let attempt = 0; attempt < 40 && (await evaluate('window.hideApp.getLanguage()')) !== 'en'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const english = await evaluate(`({
      language: window.hideApp.getLanguage ? 'pending' : 'pending',
      lang: document.documentElement.lang,
      select: document.querySelector('#app-language').value,
      empty: document.querySelector('#empty h3').textContent,
      showAll: document.querySelector('#restore-all span').textContent,
      column: document.querySelectorAll('th')[0].textContent,
      durationColumn: document.querySelectorAll('th')[2].textContent,
      placeholder: document.querySelector('#app-search').placeholder,
      toggle: document.querySelector('.toggle-label strong').textContent,
      appearance: document.querySelector('#appearance-title').textContent,
      palette: document.querySelector('.palette-fieldset legend').textContent,
      languageLabel: document.querySelector('.language-setting > span').textContent,
      trayMinimize: document.querySelector('#close').getAttribute('aria-label'),
      reset: document.querySelector('#appearance-reset').textContent
    })`);
    assert.deepEqual(english, {
      language: 'pending', lang: 'en', select: 'en', empty: 'No hidden applications yet', showAll: 'Show all',
      column: 'APPLICATION', durationColumn: 'HIDDEN FOR', placeholder: 'Search applications...',
      toggle: 'Enable application hiding', appearance: 'Customize appearance', palette: 'Color palette',
      languageLabel: 'Application language', trayMinimize: 'Minimize to system tray', reset: 'Reset to defaults'
    });
    assert.equal(trayMenu.getMenuItemById('show').label, 'Show HideApp');
    assert.equal(trayMenu.getMenuItemById('restore-all').label, 'Show all hidden windows');
    assert.equal(trayMenu.getMenuItemById('quit').label, 'Quit HideApp');
    assert.equal(trayTooltip, 'HideApp · 0 hidden windows');
    window.webContents.send('state', { ...actualState, windows: [{ id: '301', title: 'Discord', icon: null, hiddenAt: Date.now() - 3756000 }] });
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.match(await evaluate('document.querySelector(".hidden-duration").textContent'), /^1 h 2 min \d+ s$/);
    assert.equal(await evaluate('document.querySelector(".restore-button").textContent'), 'Show');
    window.webContents.send('state', actualState);
    await new Promise(resolve => setTimeout(resolve, 120));
    await reload();
    for (let attempt = 0; attempt < 60 && (await evaluate('document.documentElement.lang')) !== 'en'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await evaluate('document.documentElement.lang'), 'en');
    assert.equal(await evaluate('document.querySelector(".toggle-label strong").textContent'), 'Enable application hiding');
    await evaluate(`(() => { const select = document.querySelector('#app-language'); select.value = 'tr'; select.dispatchEvent(new Event('change')); })()`);
    for (let attempt = 0; attempt < 40 && (await evaluate('window.hideApp.getLanguage()')) !== 'tr'; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(await evaluate('document.documentElement.lang'), 'tr');
    assert.equal(await evaluate('document.querySelector("#empty h3").textContent'), 'Henüz gizlenen uygulama yok');
    assert.equal(trayMenu.getMenuItemById('quit').label, 'HideApp’i kapat');
    // Real native state must survive a renderer-free tray session. The
    // fixture seam cannot target user windows and only exists in test mode.
    const fixture = childProcess.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', path.join(__dirname, 'fixture.ps1')], { windowsHide: true });
    const fixtureLines = [];
    createInterface({ input: fixture.stdout }).on('line', line => fixtureLines.push(line));
    const fixtureLine = async prefix => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const index = fixtureLines.findIndex(line => line.startsWith(prefix));
        if (index >= 0) return fixtureLines.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw new Error('Fixture response timed out: ' + prefix);
    };
    try {
      const fixtureId = (await fixtureLine('ready=')).slice(6);
      assert.ok(nativeHelper);
      await evaluate('window.hideApp.setEnabled(true)');
      const backgroundWindow = window;
      window.close();
      await waitForDestroyed(backgroundWindow);
      nativeHelper.stdin.write('test-hide ' + fixtureId + '\n');
      for (let attempt = 0; attempt < 80 && !trayMenu.getMenuItemById('restore-all').enabled; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(trayMenu.getMenuItemById('restore-all').enabled, true);
      assert.equal(BrowserWindow.getAllWindows().length, 0);
      fixture.stdin.write('visible\n');
      await fixtureLine('hidden');
      applicationTray.emit('click');
      await waitForReopened();
      const backgroundState = await evaluate('window.hideApp.getState()');
      assert.equal(backgroundState.windows.length, 1);
      assert.equal(backgroundState.windows[0].id, fixtureId);
      for (let attempt = 0; attempt < 60 && !(await evaluate('Boolean(document.querySelector("#windows tr"))')); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(await evaluate('document.querySelector(".app-title").textContent'), 'HideApp integration fixture');
      const restoreWindow = window;
      window.close();
      await waitForDestroyed(restoreWindow);
      trayMenu.getMenuItemById('restore-all').click();
      for (let attempt = 0; attempt < 80 && trayMenu.getMenuItemById('restore-all').enabled; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      assert.equal(trayMenu.getMenuItemById('restore-all').enabled, false);
      fixture.stdin.write('visible\n');
      await fixtureLine('visible');
      applicationTray.emit('click');
      await waitForReopened();
      assert.equal((await evaluate('window.hideApp.getState()')).windows.length, 0);
      await evaluate('window.hideApp.setEnabled(false)');
    } finally { fixture.stdin.end('quit\n'); }
    window.setSize(920, 640);
    await new Promise(resolve => setTimeout(resolve, 100));
    // Diagnostic screenshot is optional on occluded/headless desktops.
    try {
      const image = await window.webContents.capturePage();
      fs.mkdirSync(path.join(__dirname, '..', '.runtime'), { recursive: true });
      fs.writeFileSync(path.join(__dirname, '..', '.runtime', 'screenshot.png'), image.toPNG());
    } catch (error) {
      if (!error.message.includes('Current display surface not available for capture')) throw error;
      console.warn('Diagnostic screenshot unavailable; behavior assertions completed.');
    }
    app.once('will-quit', () => {
      assert.equal(applicationTray.isDestroyed(), true);
      clearTimeout(timer);
    });
    console.log('Electron smoke passed: renderer release/recreation, preserved search/focus/geometry, Turkish/English switching, persisted language, localized tray and timers, show menu, activation menu, quit cleanup, live hidden durations without row rebuild, column dividers, themed search highlights, arrow/keyboard navigation, Ctrl+F, Unicode matching, live filtering, Escape/close, minimized list rendering, IPC, helper, toggle, six palettes in light/dark modes, font, independent scaling, persistence, reset and small-window layout.');
    trayMenu.getMenuItemById('quit').click();
  } catch (error) {
    console.error(error);
    clearTimeout(timer);
    app.exit(1);
  }
});
