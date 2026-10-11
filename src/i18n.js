(function (root) {
  const messages = {
    tr: {
      language: 'Uygulama dili', windowControls: 'Pencere kontrolleri', appearance: 'Görünüm ayarları',
      minimize: 'Simge durumuna küçült', maximize: 'Büyüt', restoreSize: 'Önceki boyuta getir', trayMinimize: 'Sistem tepsisine küçült',
      searchPlaceholder: 'Uygulama ara...', searchLabel: 'Gizlenen uygulamalarda ara', searchPrevious: 'Önceki eşleşen uygulama',
      searchPreviousTip: 'Önceki eşleşme (Shift + Enter)', searchNext: 'Sonraki eşleşen uygulama', searchNextTip: 'Sonraki eşleşme (Enter)',
      searchClose: 'Aramayı kapat', searchCloseTip: 'Aramayı kapat (Esc)', enableHiding: 'Uygulamaları gizlemeyi aktifleştir',
      shortcutPrefix: 'Kapatma düğmesi üzerinde', rightClick: 'sağ tık', hiddenApps: 'Gizlenen uygulamalar', showAll: 'Tümünü göster',
      columnApp: 'UYGULAMA', columnStatus: 'DURUM', columnDuration: 'ŞU SÜREDİR GİZLİ', columnAction: 'İşlem',
      empty: 'Henüz gizlenen uygulama yok', noMatches: 'Aramayla eşleşen uygulama yok', hidden: 'Gizlendi', show: 'Göster',
      showWindow: '{title} penceresini göster', hiddenAt: 'Gizlenme zamanı: {date}', untitled: 'Adsız uygulama',
      appearanceTitle: 'Görünümü özelleştir', appearanceDescription: 'Kendi tarzını seç. Değişiklikler anında uygulanır.',
      appearanceClose: 'Görünüm ayarlarını kapat', themeMode: 'Tema modu', lightTheme: 'Açık tema (varsayılan)', darkTheme: 'Koyu tema',
      palette: 'Renk paleti', orange: 'Turuncu', ocean: 'Okyanus', teal: 'Turkuaz', forest: 'Orman', crimson: 'Kırmızı', slate: 'Grafit',
      font: 'Yazı tipi', defaultFont: 'Segoe UI (varsayılan)', textSize: 'Yazı boyutu', textSizeHint: 'Metinleri bağımsız olarak küçült veya büyüt.',
      objectSize: 'Arayüz öğelerinin büyüklüğü', objectSizeHint: 'Düğmeler, ikonlar, boşluklar ve satır yükseklikleri.',
      radius: 'Köşe yuvarlaklığı', radiusHint: 'Düz köşelerden yuvarlatılmış kartlara.', reset: 'Varsayılana sıfırla',
      settingsStored: 'Ayarlar bu bilgisayarda saklanır.', settingsSaved: 'Değişiklikler otomatik kaydedildi.',
      settingsReset: 'Görünüm varsayılan ayarlara sıfırlandı.', settingsSaveFailed: 'Görünüm uygulandı ancak ayarlar kaydedilemedi.',
      languageSaveFailed: 'Dil kaydedilemedi. Önceki dil korundu.', trayShow: 'HideApp’i göster', trayRestoreAll: 'Tüm gizli pencereleri göster',
      trayQuit: 'HideApp’i kapat', trayTooltip: 'HideApp · {count} gizli pencere', windowsOnly: 'Pencere gizleme özelliği yalnızca Windows üzerinde çalışır.',
      helperStopped: 'Windows yardımcı süreci durdu. HideApp’i yeniden başlatın.', helperStartFailed: 'Windows yardımcı süreci başlatılamadı.',
      hideFailed: 'Bu pencere gizlenemedi. Uygulama yönetici yetkisiyle çalışıyor olabilir.', day: 'gün', hour: 'sa', minute: 'dk', second: 'sn'
    },
    en: {
      language: 'Application language', windowControls: 'Window controls', appearance: 'Appearance settings',
      minimize: 'Minimize', maximize: 'Maximize', restoreSize: 'Restore window size', trayMinimize: 'Minimize to system tray',
      searchPlaceholder: 'Search applications...', searchLabel: 'Search hidden applications', searchPrevious: 'Previous matching application',
      searchPreviousTip: 'Previous match (Shift + Enter)', searchNext: 'Next matching application', searchNextTip: 'Next match (Enter)',
      searchClose: 'Close search', searchCloseTip: 'Close search (Esc)', enableHiding: 'Enable application hiding',
      shortcutPrefix: 'On the close button:', rightClick: 'right-click', hiddenApps: 'Hidden applications', showAll: 'Show all',
      columnApp: 'APPLICATION', columnStatus: 'STATUS', columnDuration: 'HIDDEN FOR', columnAction: 'Action',
      empty: 'No hidden applications yet', noMatches: 'No applications match your search', hidden: 'Hidden', show: 'Show',
      showWindow: 'Show the {title} window', hiddenAt: 'Hidden since: {date}', untitled: 'Untitled application',
      appearanceTitle: 'Customize appearance', appearanceDescription: 'Choose your style. Changes apply instantly.',
      appearanceClose: 'Close appearance settings', themeMode: 'Theme mode', lightTheme: 'Light theme (default)', darkTheme: 'Dark theme',
      palette: 'Color palette', orange: 'Orange', ocean: 'Ocean', teal: 'Teal', forest: 'Forest', crimson: 'Red', slate: 'Graphite',
      font: 'Font', defaultFont: 'Segoe UI (default)', textSize: 'Text size', textSizeHint: 'Make text smaller or larger independently.',
      objectSize: 'Interface element size', objectSizeHint: 'Buttons, icons, spacing, and row heights.',
      radius: 'Corner roundness', radiusHint: 'From square corners to rounded cards.', reset: 'Reset to defaults',
      settingsStored: 'Settings are stored on this computer.', settingsSaved: 'Changes saved automatically.',
      settingsReset: 'Appearance reset to defaults.', settingsSaveFailed: 'Appearance applied, but settings could not be saved.',
      languageSaveFailed: 'The language could not be saved. The previous language was kept.', trayShow: 'Show HideApp', trayRestoreAll: 'Show all hidden windows',
      trayQuit: 'Quit HideApp', trayTooltip: 'HideApp · {count} hidden windows', windowsOnly: 'Window hiding is only available on Windows.',
      helperStopped: 'The Windows helper stopped. Restart HideApp.', helperStartFailed: 'The Windows helper could not be started.',
      hideFailed: 'This window could not be hidden. The application may be running as administrator.', day: 'd', hour: 'h', minute: 'min', second: 's'
    }
  };
  function normalizeLanguage(value) { return value === 'en' ? 'en' : 'tr'; }
  function translate(language, key, params = {}) {
    const message = messages[normalizeLanguage(language)][key] ?? messages.tr[key] ?? key;
    return message.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(params, name) ? String(params[name]) : match);
  }
  const api = { messages, normalizeLanguage, translate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HideAppI18n = api;
})(globalThis);
