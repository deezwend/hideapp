const theme = window.HideAppTheme;
const t = (key) => window.hideAppLocale.t(key);
const settingsDialog = document.querySelector('#appearance-dialog');
const saveStatus = document.querySelector('#appearance-status');
let appearance = { ...theme.defaults };
try {
  appearance = theme.normalize(JSON.parse(localStorage.getItem(theme.storageKey)));
} catch { /* Missing or damaged preferences fall back to safe defaults. */ }

function applyAppearance() {
  const root = document.documentElement;
  root.dataset.palette = appearance.palette;
  root.dataset.mode = appearance.mode;
  document.querySelector('#theme-mode').value = appearance.mode;
  root.style.setProperty('--font', theme.fonts[appearance.font]);
  root.style.setProperty('--text-scale', appearance.textSize / 100);
  root.style.setProperty('--unit', appearance.objectSize / 100 + 'px');
  root.style.setProperty('--radius', appearance.radius + 'px');
  for (const radio of document.querySelectorAll('input[name="palette"]')) radio.checked = radio.value === appearance.palette;
  document.querySelector('#font').value = appearance.font;
  for (const key of ['textSize', 'objectSize', 'radius']) {
    document.getElementById(key).value = appearance[key];
    document.getElementById(key + '-value').value = appearance[key] + (key === 'radius' ? ' px' : '%');
  }
}
function saveAppearance(messageKey = 'settingsSaved') {
  applyAppearance();
  try {
    localStorage.setItem(theme.storageKey, JSON.stringify(appearance));
    saveStatus.dataset.i18n = messageKey;
    saveStatus.textContent = t(messageKey);
  } catch {
    saveStatus.dataset.i18n = 'settingsSaveFailed';
    saveStatus.textContent = t('settingsSaveFailed');
  }
}
document.querySelector('#appearance-open').addEventListener('click', () => settingsDialog.showModal());
document.querySelector('#appearance-close').addEventListener('click', () => settingsDialog.close());
settingsDialog.addEventListener('click', event => {
  if (event.target !== settingsDialog) return;
  const bounds = settingsDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) settingsDialog.close();
});
for (const radio of document.querySelectorAll('input[name="palette"]')) {
  radio.addEventListener('change', () => {
    appearance = theme.normalize({ ...appearance, palette: radio.value });
    saveAppearance();
  });
}
document.querySelector('#theme-mode').addEventListener('change', event => {
  appearance = theme.normalize({ ...appearance, mode: event.target.value });
  saveAppearance();
});
document.querySelector('#font').addEventListener('change', event => {
  appearance = theme.normalize({ ...appearance, font: event.target.value });
  saveAppearance();
});
for (const key of ['textSize', 'objectSize', 'radius']) {
  document.getElementById(key).addEventListener('input', event => {
    appearance = theme.normalize({ ...appearance, [key]: Number(event.target.value) });
    saveAppearance();
  });
}
document.querySelector('#appearance-reset').addEventListener('click', () => {
  appearance = { ...theme.defaults };
  saveAppearance('settingsReset');
});
applyAppearance();
