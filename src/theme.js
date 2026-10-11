(function (root) {
  const defaults = Object.freeze({ mode: 'light', palette: 'orange', font: 'segoe', textSize: 100, objectSize: 100, radius: 12 });
  const palettes = ['orange', 'ocean', 'teal', 'forest', 'crimson', 'slate'];
  const fonts = {
    segoe: '"Segoe UI", sans-serif',
    arial: 'Arial, sans-serif',
    tahoma: 'Tahoma, sans-serif',
    verdana: 'Verdana, sans-serif',
    consolas: 'Consolas, monospace',
  };
  function number(value, fallback, min, max) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
  }
  function normalize(value) {
    const data = value && typeof value === 'object' ? value : {};
    return {
      mode: data.mode === 'dark' ? 'dark' : defaults.mode,
      palette: palettes.includes(data.palette) ? data.palette : defaults.palette,
      font: Object.hasOwn(fonts, data.font) ? data.font : defaults.font,
      textSize: number(data.textSize, defaults.textSize, 85, 140),
      objectSize: number(data.objectSize, defaults.objectSize, 85, 130),
      radius: number(data.radius, defaults.radius, 0, 20),
    };
  }
  const theme = Object.freeze({ defaults, palettes: Object.freeze(palettes), fonts: Object.freeze(fonts), normalize, storageKey: 'hideapp.appearance.v1' });
  if (typeof module !== 'undefined' && module.exports) module.exports = theme;
  else root.HideAppTheme = theme;
})(globalThis);
