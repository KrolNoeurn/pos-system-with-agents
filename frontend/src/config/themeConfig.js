/**
 * Centralized UI theme, layout, and localization configuration.
 */
export const THEME_CONFIG = {
  appName: import.meta.env.VITE_APP_NAME || "POS System",
  storageKeys: {
    theme: "pos_ui_theme",
    layout: "pos_ui_layout",
    sidebarMode: "pos_ui_sidebar_mode",
    language: "pos_ui_language",
  },
  defaults: {
    theme: "light",
    layout: "vertical",
    sidebarMode: "expanded", // expanded | mini | collapsed
    language: "en",
  },
  themes: ["light", "dark"],
  layouts: ["vertical", "horizontal"],
  sidebarModes: ["expanded", "mini", "collapsed"],
  languages: [
    { code: "en", label: "English", shortLabel: "EN" },
    { code: "km", label: "ភាសាខ្មែរ", shortLabel: "ខ្មែរ" },
  ],
};
