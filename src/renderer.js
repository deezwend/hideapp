const api = window.hideApp;
const translate = (key, params) => window.hideAppLocale.t(key, params);
const toggle = document.querySelector('#enabled');
let maximized = false;
const tbody = document.querySelector('#windows');
const restoreAll = document.querySelector('#restore-all');
const searchBar = document.querySelector('#search-bar');
const searchInput = document.querySelector('#app-search');
const searchPrevious = document.querySelector('#search-prev');
const searchNext = document.querySelector('#search-next');
const searchSegments = new Intl.Segmenter('tr', { granularity: 'grapheme' });
let activeSearchId = null;
let searchReturnFocus;
let current = { ready: false, enabled: false, windows: [] };

function normalizeSearch(text) {
  return text.trim().normalize('NFC').toLocaleLowerCase('tr').replace(/ı/g, 'i');
}
function searchRanges(text, query) {
  if (!query) return [];
  // Map normalized characters back to the original graphemes so Turkish
  // casing, combining characters and emoji do not shift the highlight.
  let normalized = '';
  const positions = [];
  for (const part of searchSegments.segment(text)) {
    const value = part.segment.normalize('NFC').toLocaleLowerCase('tr').replace(/ı/g, 'i');
    normalized += value;
    for (let i = 0; i < value.length; i++) positions.push([part.index, part.index + part.segment.length]);
  }
  const ranges = [];
  for (let offset = 0; offset <= normalized.length - query.length;) {
    const index = normalized.indexOf(query, offset);
    if (index < 0) break;
    const start = positions[index][0];
    const end = positions[index + query.length - 1][1];
    const previous = ranges[ranges.length - 1];
    if (previous && start < previous[1]) previous[1] = Math.max(previous[1], end);
    else ranges.push([start, end]);
    offset = index + query.length;
  }
  return ranges;
}
function highlightedTitle(title, text, ranges) {
  let offset = 0;
  for (const [start, end] of ranges) {
    title.append(document.createTextNode(text.slice(offset, start)));
    const mark = document.createElement('mark');
    mark.className = 'search-highlight';
    mark.textContent = text.slice(start, end);
    title.append(mark);
    offset = end;
  }
  title.append(document.createTextNode(text.slice(offset)));
}
function updateActiveSearch(scroll = false) {
  let activeRow;
  for (const row of tbody.children) {
    const active = row.dataset.windowId === activeSearchId;
    row.classList.toggle('search-active', active);
    if (active) { row.setAttribute('aria-current', 'true'); activeRow = row; }
    else row.removeAttribute('aria-current');
  }
  if (activeRow) {
    searchInput.setAttribute('aria-activedescendant', activeRow.id);
    if (scroll) activeRow.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  } else searchInput.removeAttribute('aria-activedescendant');
}
function navigateSearch(direction) {
  if (!normalizeSearch(searchInput.value) || !tbody.children.length) return;
  const rows = [...tbody.children];
  const index = rows.findIndex(row => row.dataset.windowId === activeSearchId);
  activeSearchId = rows[(index + direction + rows.length) % rows.length].dataset.windowId;
  updateActiveSearch(true);
}
function render(state) {
  current = state;
  const query = normalizeSearch(searchInput.value);
  const visibleWindows = state.windows.map(item => ({ item, ranges: searchRanges(item.title, query) }))
    .filter(match => !query || match.ranges.length);
  if (!query || !visibleWindows.length) activeSearchId = null;
  else if (!visibleWindows.some(match => match.item.id === activeSearchId)) activeSearchId = visibleWindows[0].item.id;
  searchPrevious.disabled = searchNext.disabled = !query || !visibleWindows.length;
  toggle.checked = state.enabled;
  toggle.disabled = !state.ready;
  document.querySelector('#maximize').setAttribute('aria-label', maximized ? translate('restoreSize') : translate('maximize'));
  document.querySelector('#count').textContent = query ? visibleWindows.length + ' / ' + state.windows.length : state.windows.length;
  document.querySelector('#empty').hidden = visibleWindows.length > 0;
  document.querySelector('#empty h3').textContent = state.windows.length && query ? translate('noMatches') : translate('empty');
  restoreAll.disabled = !state.ready || !state.windows.length;
  const error = document.querySelector('#error');
  error.hidden = !state.error;
  error.textContent = state.error || '';
  tbody.replaceChildren();
  for (const { item, ranges } of visibleWindows) {
    const row = document.createElement('tr');
    row.dataset.windowId = item.id;
    row.id = 'window-row-' + item.id;
    const app = document.createElement('td');
    const cell = document.createElement('div');
    cell.className = 'app-cell';
    let icon;
    if (item.icon && item.icon.startsWith('data:image/png;base64,')) {
      icon = document.createElement('img');
      icon.src = item.icon;
      icon.alt = '';
      icon.className = 'app-icon';
    } else {
      icon = document.createElement('span');
      icon.textContent = '▣';
      icon.className = 'app-icon fallback-icon';
      icon.setAttribute('aria-hidden', 'true');
    }
    const info = document.createElement('div');
    info.className = 'app-info';
    const title = document.createElement('span');
    title.className = 'app-title';
    highlightedTitle(title, item.title, ranges);
    title.title = item.title;
    info.append(title);
    cell.append(icon, info);
    app.append(cell);
    const statusCell = document.createElement('td');
    statusCell.className = 'hidden-badge';
    statusCell.textContent = translate('hidden');
    const elapsed = document.createElement('td');
    const action = document.createElement('td');
    const duration = document.createElement('span');
    duration.className = 'hidden-duration';
    if (typeof item.hiddenAt === 'number' && Number.isFinite(item.hiddenAt) && item.hiddenAt > 0) {
      duration.dataset.hiddenAt = item.hiddenAt;
      duration.title = translate('hiddenAt', { date: new Date(item.hiddenAt).toLocaleString(window.hideAppLocale.language === 'en' ? 'en-US' : 'tr-TR') });
    }
    duration.textContent = window.formatHiddenDuration(item.hiddenAt, Date.now(), window.hideAppLocale.language);
    const button = document.createElement('button');
    button.className = 'restore-button';
    button.textContent = translate('show');
    button.disabled = !state.ready;
    button.setAttribute('aria-label', translate('showWindow', { title: item.title }));
    button.addEventListener('click', () => api.restore(item.id));
    elapsed.append(duration);
    action.append(button);
    row.append(app, statusCell, elapsed, action);
    tbody.append(row);
  }
  updateActiveSearch();
}
function updateHiddenDurations() {
  const now = Date.now();
  for (const cell of tbody.querySelectorAll('.hidden-duration')) {
    const value = window.formatHiddenDuration(Number(cell.dataset.hiddenAt), now, window.hideAppLocale.language);
    if (cell.textContent !== value) cell.textContent = value;
  }
}
// Only timer text changes: search selection, scroll and focus stay intact.
setInterval(updateHiddenDurations, 1000);
function closeSearch() {
  searchBar.hidden = true;
  searchInput.value = '';
  render(current);
  if (searchReturnFocus?.isConnected) searchReturnFocus.focus();
}
document.addEventListener('keydown', event => {
  if (document.querySelector('#appearance-dialog').open) return;
  if (event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    if (searchBar.hidden) searchReturnFocus = document.activeElement;
    searchBar.hidden = false;
    searchInput.focus();
    searchInput.select();
  } else if (event.key === 'Escape' && !searchBar.hidden) {
    event.preventDefault();
    closeSearch();
  }
});
searchInput.addEventListener('input', () => {
  activeSearchId = null;
  render(current);
  updateActiveSearch(true);
});
searchInput.addEventListener('keydown', event => {
  if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    navigateSearch(event.key === 'ArrowUp' || (event.key === 'Enter' && event.shiftKey) ? -1 : 1);
  }
});
searchPrevious.addEventListener('click', () => navigateSearch(-1));
searchNext.addEventListener('click', () => navigateSearch(1));
document.querySelector('#search-close').addEventListener('click', closeSearch);
toggle.addEventListener('change', async () => {
  const value = toggle.checked;
  toggle.disabled = true;
  try { if (!await api.setEnabled(value)) render(current); }
  catch { render(current); }
});
restoreAll.addEventListener('click', () => api.restoreAll());
for (const action of ['minimize', 'maximize', 'close']) {
  document.getElementById(action).addEventListener('click', () => api.windowControl(action));
}
api.onMaximized(value => {
  maximized = value;
  document.querySelector('#maximize').setAttribute('aria-label', value ? translate('restoreSize') : translate('maximize'));
});
// Language changes re-render the whole list, including timers and labels.
window.addEventListener('language-changed', () => render(current));
api.onState(render);
api.getState().then(render);
