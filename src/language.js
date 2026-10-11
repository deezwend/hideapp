(function () {
  let language = 'tr';
  const catalogue = window.HideAppI18n;
  const select = document.querySelector('#app-language');
  const t = (key, params) => catalogue.translate(language, key, params);
  function apply(value) {
    language = catalogue.normalizeLanguage(value);
    document.documentElement.lang = language;
    select.value = language;
    for (const node of document.querySelectorAll('[data-i18n]')) node.textContent = t(node.dataset.i18n);
    for (const attribute of ['aria-label', 'title', 'placeholder']) {
      for (const node of document.querySelectorAll('[data-i18n-' + attribute + ']')) {
        node.setAttribute(attribute, t(node.getAttribute('data-i18n-' + attribute)));
      }
    }
    window.dispatchEvent(new Event('language-changed'));
  }
  window.hideAppLocale = { t, get language() { return language; } };
  select.addEventListener('change', async () => {
    const previous = language;
    const requested = select.value;
    select.disabled = true;
    apply(requested);
    try {
      const result = await window.hideApp.setLanguage(requested);
      if (!result.ok) throw new Error('Language could not be saved');
      const status = document.querySelector('#appearance-status');
      status.dataset.i18n = 'settingsSaved';
      status.textContent = t('settingsSaved');
    } catch {
      apply(previous);
      const status = document.querySelector('#appearance-status');
      status.dataset.i18n = 'languageSaveFailed';
      status.textContent = t('languageSaveFailed');
    } finally { select.disabled = false; }
  });
  window.hideAppLocale.ready = window.hideApp.getLanguage().then(apply).catch(() => apply('tr'));
})();
